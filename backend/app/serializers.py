from collections import defaultdict
from .models import Account, User, Room, Membership, Message, Boost, RoomTask, ScheduledMessage


def serialize_user(user: User, include_email: bool = False, include_bot_token: bool = False) -> dict:
    data = {
        "id": user.id,
        "name": user.name,
        "bio": user.bio,
        "status_emoji": user.status_emoji,
        "status_text": user.status_text,
        "role": user.role,
        "status": user.status,
        "avatar_url": f"/api/users/{user.id}/avatar" if user.avatar_path else None,
        "created_at": user.created_at.isoformat() + "Z",
    }
    if include_email:
        data["email_address"] = user.email_address
    if include_bot_token and user.bot_token:
        data["bot_token"] = user.bot_token
    return data


def serialize_account(account: Account) -> dict:
    return {
        "id": account.id,
        "name": account.name,
        "join_code": account.join_code,
        "logo_url": "/api/account/logo" if account.logo_path else None,
        "custom_styles": account.custom_styles,
        "created_at": account.created_at.isoformat() + "Z",
    }


def serialize_boosts(boosts: list[Boost], current_user_id: int | None = None) -> list[dict]:
    grouped: dict[str, dict] = defaultdict(lambda: {"content": "", "count": 0, "user_ids": [], "user_names": [], "me": False})
    for b in boosts:
        entry = grouped[b.content]
        entry["content"] = b.content
        entry["count"] += 1
        entry["user_ids"].append(b.booster_id)
        if b.booster:
            entry["user_names"].append(b.booster.name)
        if current_user_id and b.booster_id == current_user_id:
            entry["me"] = True
    return list(grouped.values())


def serialize_message(
    msg: Message,
    current_user_id: int | None = None,
    bookmarked_ids: set[int] | None = None,
    reply_counts: dict[int, int] | None = None,
) -> dict:
    reply_preview = None
    if msg.reply_to:
        reply_preview = {
            "id": msg.reply_to.id,
            "body": msg.reply_to.body[:120] if msg.reply_to.body else "Attachment",
            "creator_name": msg.reply_to.creator.name if msg.reply_to.creator else "Unknown",
        }
    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "client_message_id": msg.client_message_id,
        "body": msg.body,
        "reply_to_id": msg.reply_to_id,
        "reply_to": reply_preview,
        "replies_count": reply_counts.get(msg.id, 0) if reply_counts is not None else 0,
        "is_pinned": bool(msg.is_pinned),
        "is_bookmarked": msg.id in bookmarked_ids if bookmarked_ids is not None else False,
        "expires_at": msg.expires_at.isoformat() + "Z" if msg.expires_at else None,
        "poll": msg.poll_json,
        "attachments": msg.attachment_json or [],
        "unfurl": msg.unfurl_json,
        "creator": serialize_user(msg.creator) if msg.creator else None,
        "boosts": serialize_boosts(msg.boosts, current_user_id),
        "created_at": msg.created_at.isoformat() + "Z",
        "updated_at": msg.updated_at.isoformat() + "Z",
    }


def serialize_room_task(task: RoomTask) -> dict:
    return {
        "id": task.id,
        "room_id": task.room_id,
        "title": task.title,
        "completed": bool(task.completed),
        "creator_id": task.creator_id,
        "creator_name": task.creator.name if task.creator else "Unknown",
        "completed_by_name": task.completed_by.name if task.completed_by else None,
        "created_at": task.created_at.isoformat() + "Z",
        "updated_at": task.updated_at.isoformat() + "Z",
    }


def serialize_scheduled_message(item: ScheduledMessage) -> dict:
    return {
        "id": item.id,
        "room_id": item.room_id,
        "body": item.body,
        "reply_to_id": item.reply_to_id,
        "attachments": item.attachment_json or [],
        "send_at": item.send_at.isoformat() + "Z",
        "created_at": item.created_at.isoformat() + "Z",
    }


def serialize_room(
    room: Room,
    membership: Membership | None = None,
    current_user_id: int | None = None,
    unlocked_room_ids: set[int] | None = None,
) -> dict:
    members = []
    for m in room.memberships:
        if m.user and m.user.status == "active":
            members.append(serialize_user(m.user))

    display_name = room.name
    if room.type == "direct":
        others = [m for m in members if m["id"] != current_user_id]
        if others:
            display_name = ", ".join(o["name"] for o in others)
        elif members:
            display_name = members[0]["name"]
        else:
            display_name = "Direct Message"

    return {
        "id": room.id,
        "name": room.name,
        "topic": room.topic,
        "display_name": display_name or "Untitled Room",
        "type": room.type,
        "creator_id": room.creator_id,
        "messages_count": room.messages_count,
        "is_locked": bool(room.passcode_hash),
        "unlocked": (not room.passcode_hash) or (unlocked_room_ids is not None and room.id in unlocked_room_ids),
        "disappear_seconds": room.disappear_seconds,
        "involvement": membership.involvement if membership else "mentions",
        "is_starred": bool(membership.is_starred) if membership else False,
        "unread": bool(membership and membership.unread_at is not None),
        "unread_at": membership.unread_at.isoformat() + "Z" if membership and membership.unread_at else None,
        "members": members,
        "created_at": room.created_at.isoformat() + "Z",
        "updated_at": room.updated_at.isoformat() + "Z",
    }
