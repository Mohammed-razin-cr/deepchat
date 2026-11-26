import html as html_lib
import re
import secrets
from pathlib import Path
from urllib.parse import urljoin
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_session, get_current_user
from ..config import UPLOADS_DIR
from ..database import get_db
from ..models import Bookmark, Boost, Membership, Message, PushSubscription, Room, SearchHistory, SessionRoomUnlock, User, UserSession, utcnow
from ..push import get_vapid_public_key, send_push_to_user
from ..schemas import PushSubscriptionRequest, UnfurlRequest
from ..security import SAFE_INLINE_EXTS, sanitize_filename, save_upload_file, validate_public_url
from ..serializers import serialize_message
from .messages_router import _user_bookmarked_ids

router = APIRouter(prefix="/api", tags=["extras"])


@router.post("/uploads")
def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    file_id = secrets.token_urlsafe(12)
    orig_name = sanitize_filename(file.filename)
    safe_name = f"{file_id}_{orig_name}"
    dest = UPLOADS_DIR / safe_name
    size = save_upload_file(file, dest)
    return {
        "attachment": {
            "id": file_id,
            "filename": orig_name,
            "content_type": file.content_type or "application/octet-stream",
            "byte_size": size,
            "url": f"/api/uploads/{safe_name}",
        }
    }


@router.get("/uploads/{filename}")
def serve_upload(filename: str, current_user: User = Depends(get_current_user)):
    target = (UPLOADS_DIR / filename).resolve()
    if not str(target).startswith(str(UPLOADS_DIR.resolve())) or not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    ext = target.suffix.lower()
    headers = {"X-Content-Type-Options": "nosniff"}
    if ext not in SAFE_INLINE_EXTS:
        headers["Content-Disposition"] = f'attachment; filename="{sanitize_filename(target.name)}"'
        return FileResponse(target, media_type="application/octet-stream", headers=headers)
    return FileResponse(target, headers=headers)


@router.post("/unfurl")
async def unfurl_link(payload: UnfurlRequest, current_user: User = Depends(get_current_user)):
    current_url = validate_public_url(payload.url)
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            resp = None
            for _ in range(4):
                validate_public_url(current_url)
                resp = await client.get(current_url, headers={"User-Agent": "DeepChatBot/1.0"})
                if resp.is_redirect and resp.headers.get("location"):
                    current_url = urljoin(current_url, resp.headers["location"])
                    continue
                break
            if not resp or resp.status_code >= 400 or "text/html" not in resp.headers.get("content-type", ""):
                return {"unfurl": None}
            text_body = resp.text[:100_000]
    except HTTPException:
        raise
    except Exception:
        return {"unfurl": None}

    def _meta(prop: str) -> str | None:
        m = re.search(
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(prop)}["\'][^>]+content=["\']([^"\']+)["\']',
            text_body,
            re.IGNORECASE,
        )
        if not m:
            m = re.search(
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(prop)}["\']',
                text_body,
                re.IGNORECASE,
            )
        return html_lib.unescape(m.group(1)).strip() if m else None

    title = _meta("og:title")
    if not title:
        tm = re.search(r"<title[^>]*>(.*?)</title>", text_body, re.IGNORECASE | re.DOTALL)
        title = html_lib.unescape(tm.group(1)).strip() if tm else None
    description = _meta("og:description") or _meta("description")
    image = _meta("og:image")
    site_name = _meta("og:site_name")
    if not title and not description:
        return {"unfurl": None}
    return {
        "unfurl": {
            "url": current_url,
            "title": title,
            "description": description,
            "image": image,
            "site_name": site_name,
        }
    }


@router.get("/searches")
def search_messages(q: str = "", db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    history = (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == current_user.id)
        .order_by(SearchHistory.created_at.desc())
        .limit(10)
        .all()
    )
    results = []
    query_str = q.strip()
    if query_str:
        db.query(SearchHistory).filter(
            SearchHistory.user_id == current_user.id, SearchHistory.query == query_str
        ).delete()
        db.add(SearchHistory(user_id=current_user.id, query=query_str))
        db.commit()

        unlocked_ids = {
            r[0] for r in db.query(SessionRoomUnlock.room_id).filter(SessionRoomUnlock.session_id == sess.id).all()
        }
        member_rooms = (
            db.query(Room)
            .join(Membership, Membership.room_id == Room.id)
            .filter(Membership.user_id == current_user.id)
            .all()
        )
        allowed_room_ids = {
            r.id for r in member_rooms if not r.passcode_hash or r.id in unlocked_ids
        }
        if allowed_room_ids:
            safe_q = '"' + query_str.replace('"', '""') + '"'
            rows = db.execute(
                text("SELECT message_id FROM messages_fts WHERE messages_fts MATCH :q LIMIT 50"),
                {"q": safe_q},
            ).fetchall()
            msg_ids = [r[0] for r in rows]
            if not msg_ids:
                msgs = (
                    db.query(Message)
                    .options(
                        joinedload(Message.creator),
                        joinedload(Message.room),
                        joinedload(Message.reply_to).joinedload(Message.creator),
                        joinedload(Message.boosts).joinedload(Boost.booster),
                    )
                    .filter(Message.room_id.in_(allowed_room_ids), Message.body.ilike(f"%{query_str}%"))
                    .order_by(Message.created_at.desc())
                    .limit(40)
                    .all()
                )
            else:
                msgs = (
                    db.query(Message)
                    .options(
                        joinedload(Message.creator),
                        joinedload(Message.room),
                        joinedload(Message.reply_to).joinedload(Message.creator),
                        joinedload(Message.boosts).joinedload(Boost.booster),
                    )
                    .filter(Message.id.in_(msg_ids), Message.room_id.in_(allowed_room_ids))
                    .order_by(Message.created_at.desc())
                    .limit(40)
                    .all()
                )
            bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
            for m in msgs:
                item = serialize_message(m, current_user.id, bookmarked_ids)
                item["room_name"] = m.room.name if m.room and m.room.name else "Direct Message"
                results.append(item)

        history = (
            db.query(SearchHistory)
            .filter(SearchHistory.user_id == current_user.id)
            .order_by(SearchHistory.created_at.desc())
            .limit(10)
            .all()
        )

    return {
        "results": results,
        "history": [{"id": h.id, "query": h.query} for h in history],
    }


@router.delete("/searches")
def clear_search_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(SearchHistory).filter(SearchHistory.user_id == current_user.id).delete()
    db.commit()
    return {"ok": True}


@router.get("/push/vapid-public-key")
def vapid_public_key(current_user: User = Depends(get_current_user)):
    return {"public_key": get_vapid_public_key()}


@router.post("/push/subscriptions")
def save_push_subscription(
    payload: PushSubscriptionRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == current_user.id, PushSubscription.endpoint == payload.endpoint)
        .first()
    )
    if existing:
        existing.p256dh_key = payload.p256dh_key
        existing.auth_key = payload.auth_key
        existing.updated_at = utcnow()
    else:
        db.add(
            PushSubscription(
                user_id=current_user.id,
                endpoint=payload.endpoint,
                p256dh_key=payload.p256dh_key,
                auth_key=payload.auth_key,
                user_agent=request.headers.get("user-agent"),
            )
        )
    db.commit()
    return {"ok": True}


@router.post("/push/test")
def test_push(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    send_push_to_user(db, current_user.id, "DeepChat", "Test push notification is working!", url="/")
    return {"ok": True}


@router.get("/mentions")
def list_mentions(db: Session = Depends(get_db), sess: UserSession = Depends(get_current_session)):
    current_user = sess.user
    unlocked_ids = {
        r[0] for r in db.query(SessionRoomUnlock.room_id).filter(SessionRoomUnlock.session_id == sess.id).all()
    }
    memberships = (
        db.query(Membership)
        .options(joinedload(Membership.room))
        .filter(Membership.user_id == current_user.id)
        .all()
    )
    accessible_rooms = {
        m.room.id: m.room
        for m in memberships
        if m.room and (not m.room.passcode_hash or m.room.id in unlocked_ids)
    }
    if not accessible_rooms:
        return {"mentions": []}

    mention_token = f"@{current_user.name.lower()}"
    candidates = (
        db.query(Message)
        .options(
            joinedload(Message.creator),
            joinedload(Message.room),
            joinedload(Message.reply_to).joinedload(Message.creator),
            joinedload(Message.boosts).joinedload(Boost.booster),
        )
        .filter(Message.room_id.in_(list(accessible_rooms.keys())), Message.creator_id != current_user.id)
        .order_by(Message.id.desc())
        .limit(250)
        .all()
    )
    bookmarked_ids = _user_bookmarked_ids(db, current_user.id)
    now = utcnow()
    out = []
    for m in candidates:
        if m.expires_at and m.expires_at <= now:
            continue
        is_mention = mention_token in (m.body or "").lower()
        is_reply_to_me = bool(m.reply_to and m.reply_to.creator_id == current_user.id)
        if not is_mention and not is_reply_to_me:
            continue
        item = serialize_message(m, current_user.id, bookmarked_ids)
        room = accessible_rooms.get(m.room_id)
        item["room_name"] = (room.name or "Direct Message") if room else "Room"
        item["mention_kind"] = "reply" if is_reply_to_me and not is_mention else "mention"
        out.append(item)
        if len(out) >= 40:
            break
    return {"mentions": out}
