import datetime as dt
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_session, get_current_user
from ..config import settings
from ..database import SessionLocal, get_db
from ..models import Bookmark, Boost, Membership, Message, Room, SessionRoomUnlock, User, UserSession, utcnow
from ..push import send_push_to_user
from ..schemas import BoostCreateRequest, MessageCreateRequest, MessageUpdateRequest, PollVoteRequest
from ..serializers import serialize_boosts, serialize_message
from ..ws import ws_manager

router = APIRouter(tags=["messages"])


def _user_bookmarked_ids(db: Session, user_id: int) -> set[int]:
    return {b[0] for b in db.query(Bookmark.message_id).filter(Bookmark.user_id == user_id).all()}


def _check_room_access(db: Session, room_id: int, user: User, session_id: int | None = None) -> tuple[Room, Membership]:
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    membership = db.query(Membership).filter(Membership.room_id == room.id, Membership.user_id == user.id).first()
    if not membership and room.type == "open":
        membership = Membership(room_id=room.id, user_id=user.id, involvement="mentions")
        db.add(membership)
        db.commit()
        db.refresh(membership)
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if room.passcode_hash and user.role != "bot":
        if not session_id:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Room is locked")
        unlocked = (
            db.query(SessionRoomUnlock)
            .filter(SessionRoomUnlock.session_id == session_id, SessionRoomUnlock.room_id == room.id)
            .first()
        )
        if not unlocked:
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Room is locked. Enter passcode to unlock.")
    return room, membership


def _index_message_fts(db: Session, msg: Message):
    db.execute(text("DELETE FROM messages_fts WHERE message_id = :mid"), {"mid": msg.id})
    db.execute(
        text("INSERT INTO messages_fts (message_id, room_id, body) VALUES (:mid, :rid, :body)"),
        {"mid": msg.id, "rid": msg.room_id, "body": msg.body or ""},
    )


def _dispatch_notifications(room_id: int, sender_id: int, sender_name: str, body: str):
    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            return
        memberships = (
            db.query(Membership)
            .options(joinedload(Membership.user))
            .filter(Membership.room_id == room_id, Membership.user_id != sender_id)
            .all()
        )
        body_lower = (body or "").lower()
        for m in memberships:
            if not m.user or m.user.status != "active" or m.user.role == "bot":
                continue
            mentioned = f"@{m.user.name.lower()}" in body_lower
            should_push = (
                room.type == "direct"
                or m.involvement == "everything"
                or (m.involvement == "mentions" and mentioned)
            )
            if should_push:
                title = f"{sender_name}" if room.type == "direct" else f"{sender_name} in #{room.name}"
                preview = (body or "Sent an attachment")[:140]
                send_push_to_user(db, m.user_id, title, preview, url=f"/?room={room_id}")
    finally:
        db.close()


async def _create_message_core(
    db: Session,
    room: Room,
    creator: User,
    payload: MessageCreateRequest,
    background_tasks: BackgroundTasks | None = None,
) -> dict:
    if not (payload.body or "").strip() and not payload.attachments and not payload.poll:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    expires_at = None
    if room.disappear_seconds and room.disappear_seconds > 0:
        expires_at = utcnow() + dt.timedelta(seconds=room.disappear_seconds)

    msg = Message(
        room_id=room.id,
        creator_id=creator.id,
        client_message_id=payload.client_message_id or str(uuid.uuid4()),
        body=payload.body or "",
        reply_to_id=payload.reply_to_id,
        poll_json=payload.poll.model_dump() if payload.poll else None,
        expires_at=expires_at,
        attachment_json=payload.attachments,
        unfurl_json=payload.unfurl,
    )
    db.add(msg)
    room.messages_count = (room.messages_count or 0) + 1
    room.updated_at = utcnow()
    db.flush()
    _index_message_fts(db, msg)

    other_memberships = (
        db.query(Membership)
        .filter(Membership.room_id == room.id, Membership.user_id != creator.id)
        .all()
    )
    notify_user_ids = []
    first_unread_at = msg.created_at or utcnow()
    for m in other_memberships:
        if m.involvement != "nothing" and m.unread_at is None:
            m.unread_at = first_unread_at
        notify_user_ids.append(m.user_id)

    db.commit()
    msg = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.id == msg.id)
        .first()
    )
    serialized = serialize_message(msg, creator.id)

    await ws_manager.broadcast_room(room.id, {"type": "message.created", "message": serialized})
    await ws_manager.broadcast_users(
        notify_user_ids,
        {"type": "room.activity", "room_id": room.id, "sender_id": creator.id},
    )
    if background_tasks is not None:
        background_tasks.add_task(_dispatch_notifications, room.id, creator.id, creator.name, msg.body)
    return serialized


@router.get("/api/rooms/{room_id}/messages")
def list_messages(
    room_id: int,
    before: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    room, membership = _check_room_access(db, room_id, current_user, sess.id)

    now = utcnow()
    expired = db.query(Message).filter(Message.room_id == room.id, Message.expires_at != None, Message.expires_at <= now).all()
    if expired:
        for em in expired:
            db.execute(text("DELETE FROM messages_fts WHERE message_id = :mid"), {"mid": em.id})
            db.delete(em)
        if room.messages_count >= len(expired):
            room.messages_count -= len(expired)
        db.commit()

    q = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.room_id == room.id)
    )
    if before is not None:
        q = q.filter(Message.id < before)
    msgs = q.order_by(Message.id.desc()).limit(min(limit, 100)).all()
    msgs.reverse()

    if membership.unread_at is not None:
        membership.unread_at = None
        db.commit()

    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    msg_ids = [m.id for m in msgs]
    reply_counts: dict[int, int] = {}
    if msg_ids:
        rows = (
            db.query(Message.reply_to_id, func.count(Message.id))
            .filter(Message.reply_to_id.in_(msg_ids))
            .group_by(Message.reply_to_id)
            .all()
        )
        reply_counts = {parent_id: cnt for parent_id, cnt in rows if parent_id is not None}

    return {
        "messages": [serialize_message(m, current_user.id, bookmarked_ids, reply_counts) for m in msgs],
        "has_more": len(msgs) == min(limit, 100),
    }


@router.get("/api/messages/{message_id}/thread")
def get_message_thread(
    message_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    parent = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.id == message_id)
        .first()
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, parent.room_id, current_user, sess.id)

    replies = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.reply_to_id == parent.id)
        .order_by(Message.id.asc())
        .all()
    )
    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    reply_counts = {parent.id: len(replies)}
    return {
        "parent": serialize_message(parent, current_user.id, bookmarked_ids, reply_counts),
        "replies": [serialize_message(r, current_user.id, bookmarked_ids) for r in replies],
    }


@router.post("/api/rooms/{room_id}/messages")
async def create_message(
    room_id: int,
    payload: MessageCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    room, _ = _check_room_access(db, room_id, sess.user, sess.id)
    serialized = await _create_message_core(db, room, sess.user, payload, background_tasks)
    return {"message": serialized}


@router.patch("/api/messages/{message_id}")
async def update_message(
    message_id: int,
    payload: MessageUpdateRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.id == message_id)
        .first()
    )
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)
    if msg.creator_id != current_user.id and current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Cannot edit another user's message")
    if not payload.body.strip() and not msg.attachment_json and not msg.poll_json:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg.body = payload.body
    msg.updated_at = utcnow()
    _index_message_fts(db, msg)
    db.commit()
    db.refresh(msg)
    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    serialized = serialize_message(msg, current_user.id, bookmarked_ids)
    await ws_manager.broadcast_room(msg.room_id, {"type": "message.updated", "message": serialized})
    return {"message": serialized}


@router.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)
    if msg.creator_id != current_user.id and current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")

    room_id = msg.room_id
    room = db.query(Room).filter(Room.id == room_id).first()
    if room and room.messages_count > 0:
        room.messages_count -= 1
    db.execute(text("DELETE FROM messages_fts WHERE message_id = :mid"), {"mid": msg.id})
    db.delete(msg)
    db.commit()
    await ws_manager.broadcast_room(room_id, {"type": "message.deleted", "message_id": message_id})
    return {"ok": True}


@router.post("/api/messages/{message_id}/boosts")
async def add_boost(
    message_id: int,
    payload: BoostCreateRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)

    existing = (
        db.query(Boost)
        .filter(Boost.message_id == message_id, Boost.booster_id == current_user.id, Boost.content == payload.content)
        .first()
    )
    if existing:
        db.delete(existing)
    else:
        db.add(Boost(message_id=message_id, booster_id=current_user.id, content=payload.content))
    db.commit()

    boosts = (
        db.query(Boost)
        .options(joinedload(Boost.booster))
        .filter(Boost.message_id == message_id)
        .all()
    )
    serialized = serialize_boosts(boosts, current_user.id)
    await ws_manager.broadcast_room(
        msg.room_id,
        {"type": "message.boosts", "message_id": message_id, "boosts": serialize_boosts(boosts)},
    )
    return {"boosts": serialized}


@router.post("/api/messages/{message_id}/pin")
async def toggle_pin(
    message_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.id == message_id)
        .first()
    )
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)
    msg.is_pinned = 0 if msg.is_pinned else 1
    db.commit()
    db.refresh(msg)
    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    serialized = serialize_message(msg, current_user.id, bookmarked_ids)
    await ws_manager.broadcast_room(msg.room_id, {"type": "message.updated", "message": serialized})
    return {"message": serialized}


@router.post("/api/messages/{message_id}/vote")
async def vote_poll(
    message_id: int,
    payload: PollVoteRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.id == message_id)
        .first()
    )
    if not msg or not msg.poll_json:
        raise HTTPException(status_code=404, detail="Poll not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)

    poll = dict(msg.poll_json)
    options = []
    for opt in poll.get("options", []):
        votes = [uid for uid in opt.get("votes", []) if uid != current_user.id]
        if opt.get("id") == payload.option_id and current_user.id not in opt.get("votes", []):
            votes.append(current_user.id)
        options.append({**opt, "votes": votes})
    poll["options"] = options
    msg.poll_json = poll
    db.commit()
    db.refresh(msg)
    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    serialized = serialize_message(msg, current_user.id, bookmarked_ids)
    await ws_manager.broadcast_room(msg.room_id, {"type": "message.updated", "message": serialized})
    return {"message": serialized}


@router.post("/api/messages/{message_id}/bookmark")
def toggle_bookmark(
    message_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    current_user = sess.user
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    _check_room_access(db, msg.room_id, current_user, sess.id)
    existing = (
        db.query(Bookmark)
        .filter(Bookmark.user_id == current_user.id, Bookmark.message_id == message_id)
        .first()
    )
    if existing:
        db.delete(existing)
        bookmarked = False
    else:
        db.add(Bookmark(user_id=current_user.id, message_id=message_id))
        bookmarked = True
    db.commit()
    return {"bookmarked": bookmarked}


@router.get("/api/bookmarks")
def list_bookmarks(db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    unlocked_ids = {
        r[0] for r in db.query(SessionRoomUnlock.room_id).filter(SessionRoomUnlock.session_id == sess.id).all()
    }
    bms = (
        db.query(Bookmark)
        .options(
            joinedload(Bookmark.message).joinedload(Message.creator),
            joinedload(Bookmark.message).joinedload(Message.room),
            joinedload(Bookmark.message).joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Bookmark.message).joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Bookmark.user_id == current_user.id)
        .order_by(Bookmark.created_at.desc())
        .all()
    )
    items = []
    for bm in bms:
        if bm.message and bm.message.room:
            if bm.message.room.passcode_hash and bm.message.room.id not in unlocked_ids:
                continue
            m = serialize_message(bm.message, current_user.id, {bm.message.id})
            m["room_name"] = bm.message.room.name if bm.message.room.name else "Direct Message"
            items.append(m)
    return {"bookmarks": items}


# --- Bot API ---
def _get_bot_by_key(db: Session, bot_key: str) -> User:
    bot = db.query(User).filter(User.bot_token == bot_key, User.role == "bot", User.status == "active").first()
    if not bot:
        raise HTTPException(status_code=401, detail="Invalid bot key")
    return bot


@router.post("/api/rooms/{room_id}/{bot_key}/messages")
async def bot_create_message(
    room_id: int,
    bot_key: str,
    payload: MessageCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    bot = _get_bot_by_key(db, bot_key)
    room, _ = _check_room_access(db, room_id, bot)
    serialized = await _create_message_core(db, room, bot, payload, background_tasks)
    return {"message": serialized}


@router.get("/api/rooms/{room_id}/{bot_key}/messages")
def bot_list_messages(room_id: int, bot_key: str, limit: int = 50, db: Session = Depends(get_db)):
    bot = _get_bot_by_key(db, bot_key)
    room, _ = _check_room_access(db, room_id, bot)
    msgs = (
        db.query(Message)
        .options(joinedload(Message.creator), joinedload(Message.boosts).joinedload(Boost.booster))
        .filter(Message.room_id == room.id)
        .order_by(Message.id.desc())
        .limit(min(limit, 100))
        .all()
    )
    msgs.reverse()
    return {"messages": [serialize_message(m, bot.id) for m in msgs]}


# --- WebSockets ---
def _ws_authenticate_session(ws: WebSocket, db: Session) -> UserSession | None:
    token = ws.cookies.get(settings.session_cookie_name) or ws.query_params.get("token")
    if not token:
        return None
    sess = db.query(UserSession).filter(UserSession.token == token).first()
    if not sess or not sess.user or sess.user.status != "active":
        return None
    if sess.created_at + dt.timedelta(seconds=settings.session_max_age) < utcnow():
        return None
    return sess


@router.websocket("/ws/rooms/{room_id}")
async def ws_room(ws: WebSocket, room_id: int):
    db = SessionLocal()
    try:
        sess = _ws_authenticate_session(ws, db)
        if not sess:
            await ws.close(code=4001)
            return
        user = sess.user
        try:
            _check_room_access(db, room_id, user, sess.id)
        except HTTPException:
            await ws.close(code=4003)
            return
        user_id = user.id
        user_name = user.name
    finally:
        db.close()

    await ws_manager.connect_room(room_id, ws, user_id, user_name)
    await ws.send_json({
        "type": "call.participants",
        "participants": list(ws_manager.call_participants[room_id].values()),
    })

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")
            if msg_type == "typing":
                await ws_manager.broadcast_room(
                    room_id,
                    {"type": "typing", "user_id": user_id, "user_name": user_name},
                    exclude_ws=ws,
                )
            elif msg_type == "call.join":
                participant = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "video": bool(data.get("video", False)),
                    "audio": bool(data.get("audio", True)),
                    "hand_raised": False,
                }
                ws_manager.call_participants[room_id][user_id] = participant
                await ws_manager.broadcast_room(
                    room_id,
                    {
                        "type": "call.user_joined",
                        "participant": participant,
                        "participants": list(ws_manager.call_participants[room_id].values()),
                    },
                )
            elif msg_type == "call.leave":
                ws_manager.call_participants[room_id].pop(user_id, None)
                await ws_manager.broadcast_room(
                    room_id,
                    {
                        "type": "call.user_left",
                        "user_id": user_id,
                        "participants": list(ws_manager.call_participants[room_id].values()),
                    },
                )
            elif msg_type == "call.media":
                if user_id in ws_manager.call_participants[room_id]:
                    ws_manager.call_participants[room_id][user_id]["video"] = bool(data.get("video", False))
                    ws_manager.call_participants[room_id][user_id]["audio"] = bool(data.get("audio", True))
                    await ws_manager.broadcast_room(
                        room_id,
                        {
                            "type": "call.participants",
                            "participants": list(ws_manager.call_participants[room_id].values()),
                        },
                    )
            elif msg_type == "call.hand":
                if user_id in ws_manager.call_participants[room_id]:
                    ws_manager.call_participants[room_id][user_id]["hand_raised"] = bool(data.get("hand_raised", False))
                    await ws_manager.broadcast_room(
                        room_id,
                        {
                            "type": "call.participants",
                            "participants": list(ws_manager.call_participants[room_id].values()),
                        },
                    )
            elif msg_type in ("call.offer", "call.answer", "call.ice"):
                target_id = data.get("target_id")
                if target_id:
                    await ws_manager.send_to_room_user(
                        room_id,
                        int(target_id),
                        {**data, "from_id": user_id, "from_name": user_name},
                    )
    except WebSocketDisconnect:
        ws_manager.disconnect_room(room_id, ws)
        if user_id in ws_manager.call_participants[room_id]:
            ws_manager.call_participants[room_id].pop(user_id, None)
            await ws_manager.broadcast_room(
                room_id,
                {
                    "type": "call.user_left",
                    "user_id": user_id,
                    "participants": list(ws_manager.call_participants[room_id].values()),
                },
            )
    except Exception:
        ws_manager.disconnect_room(room_id, ws)


@router.websocket("/ws/user")
async def ws_user(ws: WebSocket):
    db = SessionLocal()
    try:
        sess = _ws_authenticate_session(ws, db)
        if not sess:
            await ws.close(code=4001)
            return
        user_id = sess.user.id
    finally:
        db.close()

    await ws_manager.connect_user(user_id, ws)
    await ws_manager.broadcast_all_users({"type": "presence.online", "user_ids": ws_manager.get_online_user_ids()})
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_user(user_id, ws)
        await ws_manager.broadcast_all_users({"type": "presence.online", "user_ids": ws_manager.get_online_user_ids()})
    except Exception:
        ws_manager.disconnect_user(user_id, ws)
        await ws_manager.broadcast_all_users({"type": "presence.online", "user_ids": ws_manager.get_online_user_ids()})
