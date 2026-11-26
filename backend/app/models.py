import datetime as dt
import secrets
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    JSON,
)
from sqlalchemy.orm import relationship
from .database import Base


def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    join_code = Column(String(64), nullable=False, default=lambda: secrets.token_urlsafe(12))
    logo_path = Column(String(255), nullable=True)
    custom_styles = Column(Text, nullable=True)
    settings = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email_address = Column(String(255), unique=True, nullable=True, index=True)
    password_digest = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    status_emoji = Column(String(16), nullable=True)
    status_text = Column(String(80), nullable=True)
    avatar_path = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="member")  # member | administrator | bot
    status = Column(String(20), nullable=False, default="active")  # active | deactivated | banned
    bot_token = Column(String(64), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")
    bans = relationship("Ban", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(128), unique=True, nullable=False, index=True, default=lambda: secrets.token_urlsafe(32))
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    last_active_at = Column(DateTime, default=utcnow, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
    unlocked_rooms = relationship("SessionRoomUnlock", back_populates="session", cascade="all, delete-orphan")


class SessionRoomUnlock(Base):
    __tablename__ = "session_room_unlocks"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "room_id", name="uq_session_room_unlock"),
    )

    session = relationship("UserSession", back_populates="unlocked_rooms")


class Ban(Base):
    __tablename__ = "bans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ip_address = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", back_populates="bans")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=True)
    topic = Column(String(280), nullable=True)
    type = Column(String(20), nullable=False, default="open")  # open | closed | direct
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    messages_count = Column(Integer, default=0, nullable=False)
    passcode_hash = Column(String(255), nullable=True)
    disappear_seconds = Column(Integer, nullable=True)  # null = off
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    memberships = relationship("Membership", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")
    tasks = relationship("RoomTask", back_populates="room", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    involvement = Column(String(20), nullable=False, default="mentions")  # everything | mentions | nothing
    is_starred = Column(Integer, default=0, nullable=False)
    unread_at = Column(DateTime, nullable=True)
    connected_at = Column(DateTime, nullable=True)
    connections = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_membership_room_user"),
    )

    room = relationship("Room", back_populates="memberships")
    user = relationship("User", back_populates="memberships")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_message_id = Column(String(64), nullable=False)
    body = Column(Text, nullable=False, default="")
    reply_to_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    is_pinned = Column(Integer, default=0, nullable=False)
    poll_json = Column(JSON, nullable=True)        # {question: str, options: [{id, text, votes: [user_id]}]}
    expires_at = Column(DateTime, nullable=True, index=True)
    attachment_json = Column(JSON, nullable=True)  # list of {id, filename, content_type, byte_size, url}
    unfurl_json = Column(JSON, nullable=True)      # {url, title, description, image, site_name}
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_messages_room_created", "room_id", "created_at"),
    )

    room = relationship("Room", back_populates="messages")
    creator = relationship("User")
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])
    boosts = relationship("Boost", back_populates="message", cascade="all, delete-orphan")


class Boost(Base):
    __tablename__ = "boosts"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    booster_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("message_id", "booster_id", "content", name="uq_boost_msg_user_content"),
    )

    message = relationship("Message", back_populates="boosts")
    booster = relationship("User")


class SearchHistory(Base):
    __tablename__ = "searches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    query = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh_key = Column(String(255), nullable=False)
    auth_key = Column(String(255), nullable=False)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="push_subscriptions")


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "message_id", name="uq_bookmark_user_msg"),
    )

    user = relationship("User")
    message = relationship("Message")


class RoomTask(Base):
    __tablename__ = "room_tasks"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    completed = Column(Integer, default=0, nullable=False)
    completed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    room = relationship("Room", back_populates="tasks")
    creator = relationship("User", foreign_keys=[creator_id])
    completed_by = relationship("User", foreign_keys=[completed_by_id])


class ScheduledMessage(Base):
    __tablename__ = "scheduled_messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    body = Column(Text, nullable=False, default="")
    reply_to_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    attachment_json = Column(JSON, nullable=True)
    send_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    room = relationship("Room")
    creator = relationship("User", foreign_keys=[creator_id])
