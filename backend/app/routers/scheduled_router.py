import datetime as dt
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_session
from ..database import SessionLocal, get_db
from ..models import ScheduledMessage, UserSession, utcnow
from ..schemas import MessageCreateRequest, ScheduledMessageCreateRequest
from ..serializers import serialize_scheduled_message
from .messages_router import _check_room_access, _create_message_core

router = APIRouter(tags=["scheduled"])


def _parse_send_at(raw: str) -> dt.datetime:
    cleaned = raw.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(cleaned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid send_at timestamp") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return parsed


@router.get("/api/rooms/{room_id}/scheduled")
def list_scheduled_messages(
    room_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    _check_room_access(db, room_id, sess.user, sess.id)
    items = (
        db.query(ScheduledMessage)
        .filter(ScheduledMessage.room_id == room_id, ScheduledMessage.creator_id == sess.user.id)
        .order_by(ScheduledMessage.send_at.asc())
        .all()
    )
    return {"scheduled": [serialize_scheduled_message(x) for x in items]}


@router.post("/api/rooms/{room_id}/scheduled")
def create_scheduled_message(
    room_id: int,
    payload: ScheduledMessageCreateRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    _check_room_access(db, room_id, sess.user, sess.id)
    if not (payload.body or "").strip() and not payload.attachments:
        raise HTTPException(status_code=400, detail="Scheduled message cannot be empty")
    send_at = _parse_send_at(payload.send_at)
    if send_at <= utcnow():
        raise HTTPException(status_code=400, detail="Scheduled time must be in the future")
    item = ScheduledMessage(
        room_id=room_id,
        creator_id=sess.user.id,
        body=payload.body or "",
        reply_to_id=payload.reply_to_id,
        attachment_json=payload.attachments,
        send_at=send_at,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"scheduled": serialize_scheduled_message(item)}


@router.post("/api/scheduled/{item_id}/send_now")
async def send_scheduled_now(
    item_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    item = (
        db.query(ScheduledMessage)
        .options(joinedload(ScheduledMessage.room), joinedload(ScheduledMessage.creator))
        .filter(ScheduledMessage.id == item_id)
        .first()
    )
    if not item or item.creator_id != sess.user.id:
        raise HTTPException(status_code=404, detail="Scheduled message not found")
    room, _ = _check_room_access(db, item.room_id, sess.user, sess.id)
    msg_payload = MessageCreateRequest(
        body=item.body,
        client_message_id=str(uuid.uuid4()),
        reply_to_id=item.reply_to_id,
        attachments=item.attachment_json,
    )
    db.delete(item)
    db.commit()
    serialized = await _create_message_core(db, room, sess.user, msg_payload, background_tasks)
    return {"message": serialized}


@router.delete("/api/scheduled/{item_id}")
def delete_scheduled_message(
    item_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    item = db.query(ScheduledMessage).filter(ScheduledMessage.id == item_id).first()
    if not item or item.creator_id != sess.user.id:
        raise HTTPException(status_code=404, detail="Scheduled message not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


async def dispatch_due_scheduled_messages():
    db = SessionLocal()
    try:
        due = (
            db.query(ScheduledMessage)
            .options(joinedload(ScheduledMessage.room), joinedload(ScheduledMessage.creator))
            .filter(ScheduledMessage.send_at <= utcnow())
            .order_by(ScheduledMessage.send_at.asc())
            .all()
        )
        for item in due:
            room = item.room
            creator = item.creator
            msg_payload = MessageCreateRequest(
                body=item.body,
                client_message_id=str(uuid.uuid4()),
                reply_to_id=item.reply_to_id,
                attachments=item.attachment_json,
            )
            db.delete(item)
            db.commit()
            if room and creator and creator.status == "active":
                await _create_message_core(db, room, creator, msg_payload, None)
    finally:
        db.close()
