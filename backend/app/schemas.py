from typing import Any
from pydantic import BaseModel, Field


class FirstRunRequest(BaseModel):
    account_name: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    email_address: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email_address: str
    password: str


class JoinRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email_address: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class ProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email_address: str | None = None
    bio: str | None = None
    status_emoji: str | None = Field(default=None, max_length=16)
    status_text: str | None = Field(default=None, max_length=80)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class AccountUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    custom_styles: str | None = None


class AdminUserUpdateRequest(BaseModel):
    role: str | None = None  # member | administrator
    status: str | None = None  # active | deactivated | banned


class BotCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class RoomCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    topic: str | None = Field(default=None, max_length=280)
    type: str = "open"  # open | closed | direct
    member_ids: list[int] = Field(default_factory=list)
    passcode: str | None = Field(default=None, max_length=64)
    disappear_seconds: int | None = None


class RoomUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    topic: str | None = Field(default=None, max_length=280)
    type: str | None = None
    member_ids: list[int] | None = None
    passcode: str | None = Field(default=None, max_length=64)
    disappear_seconds: int | None = None


class RoomTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class RoomTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    completed: bool | None = None


class RoomUnlockRequest(BaseModel):
    passcode: str


class InvolvementUpdateRequest(BaseModel):
    involvement: str  # everything | mentions | nothing


class PollOptionSchema(BaseModel):
    id: int
    text: str = Field(min_length=1, max_length=160)
    votes: list[int] = Field(default_factory=list)


class PollSchema(BaseModel):
    question: str = Field(min_length=1, max_length=240)
    options: list[PollOptionSchema] = Field(min_length=2, max_length=5)


class MessageCreateRequest(BaseModel):
    body: str = ""
    client_message_id: str = Field(default="")
    reply_to_id: int | None = None
    poll: PollSchema | None = None
    attachments: list[dict[str, Any]] | None = None
    unfurl: dict[str, Any] | None = None


class PollVoteRequest(BaseModel):
    option_id: int


class MessageUpdateRequest(BaseModel):
    body: str


class BoostCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=16)


class UnfurlRequest(BaseModel):
    url: str


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh_key: str
    auth_key: str


class ScheduledMessageCreateRequest(BaseModel):
    body: str = ""
    send_at: str
    reply_to_id: int | None = None
    attachments: list[dict[str, Any]] | None = None
