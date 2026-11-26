from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_session, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import Membership, Room, SessionRoomUnlock, User, UserSession, utcnow
from ..schemas import InvolvementUpdateRequest, RoomCreateRequest, RoomUnlockRequest, RoomUpdateRequest
from ..security import enforce_rate_limit
from ..serializers import serialize_room

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _unlocked_room_ids(db: Session, session_id: int) -> set[int]:
    rows = db.query(SessionRoomUnlock.room_id).filter(SessionRoomUnlock.session_id == session_id).all()
    return {r[0] for r in rows}


def _ensure_membership(db: Session, room: Room, user: User) -> Membership | None:
    membership = db.query(Membership).filter(Membership.room_id == room.id, Membership.user_id == user.id).first()
    if not membership and room.type == "open":
        membership = Membership(room_id=room.id, user_id=user.id, involvement="mentions")
        db.add(membership)
        db.commit()
        db.refresh(membership)
    return membership


@router.get("")
def list_rooms(db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    open_rooms = db.query(Room).filter(Room.type == "open").all()
    for r in open_rooms:
        _ensure_membership(db, r, current_user)

    memberships = (
        db.query(Membership)
        .options(joinedload(Membership.room).joinedload(Room.memberships).joinedload(Membership.user))
        .filter(Membership.user_id == current_user.id)
        .all()
    )
    unlocked_ids = _unlocked_room_ids(db, sess.id)
    rooms_out = [serialize_room(m.room, m, current_user.id, unlocked_ids) for m in memberships if m.room]
    rooms_out.sort(key=lambda r: (0 if r["type"] == "open" else 1 if r["type"] == "closed" else 2, r["display_name"].lower()))
    return {"rooms": rooms_out}


@router.post("")
def create_room(payload: RoomCreateRequest, db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    if payload.type not in ("open", "closed", "direct"):
        raise HTTPException(status_code=400, detail="Invalid room type")

    if payload.type == "direct":
        target_ids = sorted(set(payload.member_ids) | {current_user.id})
        if len(target_ids) < 2:
            raise HTTPException(status_code=400, detail="Direct message requires at least one other user")
        existing_directs = (
            db.query(Room)
            .options(joinedload(Room.memberships).joinedload(Membership.user))
            .filter(Room.type == "direct")
            .all()
        )
        for d in existing_directs:
            d_ids = sorted(m.user_id for m in d.memberships)
            if d_ids == target_ids:
                m = next((m for m in d.memberships if m.user_id == current_user.id), None)
                return {"room": serialize_room(d, m, current_user.id, _unlocked_room_ids(db, sess.id))}

        room = Room(
            name=None,
            type="direct",
            creator_id=current_user.id,
            passcode_hash=hash_password(payload.passcode) if payload.passcode else None,
            disappear_seconds=payload.disappear_seconds,
        )
        db.add(room)
        db.flush()
        for uid in target_ids:
            db.add(Membership(room_id=room.id, user_id=uid, involvement="everything"))
        db.commit()
    else:
        if not payload.name or not payload.name.strip():
            raise HTTPException(status_code=400, detail="Room name is required")
        room = Room(
            name=payload.name.strip(),
            topic=payload.topic.strip() if payload.topic else None,
            type=payload.type,
            creator_id=current_user.id,
            passcode_hash=hash_password(payload.passcode) if payload.passcode else None,
            disappear_seconds=payload.disappear_seconds,
        )
        db.add(room)
        db.flush()
        if payload.type == "open":
            users = db.query(User).filter(User.status == "active").all()
            for u in users:
                db.add(Membership(room_id=room.id, user_id=u.id, involvement="everything" if u.id == current_user.id else "mentions"))
        else:
            member_ids = set(payload.member_ids) | {current_user.id}
            for uid in member_ids:
                db.add(Membership(room_id=room.id, user_id=uid, involvement="mentions"))
        db.commit()

    # Creator's current session auto-unlocks a newly created passcode room
    if room.passcode_hash:
        db.add(SessionRoomUnlock(session_id=sess.id, room_id=room.id))
        db.commit()

    room = (
        db.query(Room)
        .options(joinedload(Room.memberships).joinedload(Membership.user))
        .filter(Room.id == room.id)
        .first()
    )
    membership = next((m for m in room.memberships if m.user_id == current_user.id), None)
    return {"room": serialize_room(room, membership, current_user.id, _unlocked_room_ids(db, sess.id))}


@router.get("/{room_id}")
def get_room(room_id: int, db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    room = (
        db.query(Room)
        .options(joinedload(Room.memberships).joinedload(Membership.user))
        .filter(Room.id == room_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    membership = _ensure_membership(db, room, current_user)
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    return {"room": serialize_room(room, membership, current_user.id, _unlocked_room_ids(db, sess.id))}


@router.patch("/{room_id}")
def update_room(room_id: int, payload: RoomUpdateRequest, db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    room = (
        db.query(Room)
        .options(joinedload(Room.memberships).joinedload(Membership.user))
        .filter(Room.id == room_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.creator_id != current_user.id and current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Only room creator or admin can edit")

    if payload.name is not None and room.type != "direct":
        room.name = payload.name.strip()
    if payload.topic is not None and room.type != "direct":
        room.topic = payload.topic.strip() or None
    if payload.type in ("open", "closed") and room.type != "direct":
        room.type = payload.type
        if room.type == "open":
            for u in db.query(User).filter(User.status == "active").all():
                _ensure_membership(db, room, u)
    if payload.member_ids is not None and room.type == "closed":
        desired = set(payload.member_ids) | {current_user.id}
        existing_ids = {m.user_id for m in room.memberships}
        for uid in desired - existing_ids:
            db.add(Membership(room_id=room.id, user_id=uid, involvement="mentions"))
        for m in list(room.memberships):
            if m.user_id not in desired:
                db.delete(m)

    if payload.passcode is not None:
        room.passcode_hash = hash_password(payload.passcode) if payload.passcode else None
        db.query(SessionRoomUnlock).filter(SessionRoomUnlock.room_id == room.id).delete()
        if room.passcode_hash:
            db.add(SessionRoomUnlock(session_id=sess.id, room_id=room.id))
    if payload.disappear_seconds is not None:
        room.disappear_seconds = payload.disappear_seconds if payload.disappear_seconds > 0 else None

    room.updated_at = utcnow()
    db.commit()
    db.refresh(room)
    membership = db.query(Membership).filter(Membership.room_id == room.id, Membership.user_id == current_user.id).first()
    return {"room": serialize_room(room, membership, current_user.id, _unlocked_room_ids(db, sess.id))}


@router.delete("/{room_id}")
def delete_room(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.creator_id != current_user.id and current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Only room creator or admin can delete")
    db.delete(room)
    db.commit()
    return {"ok": True}


@router.patch("/{room_id}/involvement")
def update_involvement(room_id: int, payload: InvolvementUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.involvement not in ("everything", "mentions", "nothing"):
        raise HTTPException(status_code=400, detail="Invalid involvement")
    membership = db.query(Membership).filter(Membership.room_id == room_id, Membership.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    membership.involvement = payload.involvement
    membership.updated_at = utcnow()
    db.commit()
    return {"involvement": membership.involvement}


@router.post("/{room_id}/read")
def mark_room_read(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(Membership).filter(Membership.room_id == room_id, Membership.user_id == current_user.id).first()
    if membership and membership.unread_at is not None:
        membership.unread_at = None
        db.commit()
    return {"ok": True}


@router.post("/{room_id}/star")
def toggle_room_star(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(Membership).filter(Membership.room_id == room_id, Membership.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    membership.is_starred = 0 if membership.is_starred else 1
    membership.updated_at = utcnow()
    db.commit()
    return {"starred": bool(membership.is_starred)}


@router.post("/{room_id}/unlock")
def unlock_room(
    room_id: int,
    payload: RoomUnlockRequest,
    request: Request,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    enforce_rate_limit(request, f"unlock:{room_id}", max_requests=10, window_seconds=60)
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    membership = _ensure_membership(db, room, sess.user)
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if not room.passcode_hash or verify_password(payload.passcode, room.passcode_hash):
        exists = (
            db.query(SessionRoomUnlock)
            .filter(SessionRoomUnlock.session_id == sess.id, SessionRoomUnlock.room_id == room_id)
            .first()
        )
        if not exists:
            db.add(SessionRoomUnlock(session_id=sess.id, room_id=room_id))
            db.commit()
        return {"unlocked": True}
    raise HTTPException(status_code=403, detail="Incorrect passcode")
