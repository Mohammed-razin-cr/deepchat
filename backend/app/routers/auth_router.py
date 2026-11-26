import secrets
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..auth import get_admin_user, get_current_user, get_current_user_optional, get_session_token, hash_password, verify_password
from ..config import LOGOS_DIR, settings
from ..database import get_db
from ..models import Account, Ban, Membership, Room, User, UserSession, utcnow
from ..schemas import (
    AccountUpdateRequest,
    AdminUserUpdateRequest,
    BotCreateRequest,
    FirstRunRequest,
    JoinRequest,
    LoginRequest,
)
from ..security import MAX_IMAGE_BYTES, enforce_rate_limit, save_upload_file, validate_image_upload
from ..serializers import serialize_account, serialize_user

router = APIRouter(prefix="/api", tags=["auth"])


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.session_max_age,
        path="/",
    )


def _create_session(db: Session, user: User, request: Request) -> UserSession:
    sess = UserSession(
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess


def _join_open_rooms(db: Session, user: User):
    open_rooms = db.query(Room).filter(Room.type == "open").all()
    for room in open_rooms:
        exists = db.query(Membership).filter(Membership.room_id == room.id, Membership.user_id == user.id).first()
        if not exists:
            db.add(Membership(room_id=room.id, user_id=user.id, involvement="mentions"))
    db.commit()


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db), user: User | None = Depends(get_current_user_optional)):
    account = db.query(Account).first()
    return {
        "needs_setup": account is None,
        "account": serialize_account(account) if account else None,
        "user": serialize_user(user, include_email=True) if user else None,
    }


@router.post("/first_run")
def first_run(payload: FirstRunRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce_rate_limit(request, "first_run", max_requests=5, window_seconds=60)
    if db.query(Account).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace is already initialized")

    account = Account(name=payload.account_name.strip())
    db.add(account)
    db.flush()

    user = User(
        name=payload.name.strip(),
        email_address=payload.email_address.strip().lower(),
        password_digest=hash_password(payload.password),
        role="administrator",
        status="active",
    )
    db.add(user)
    db.flush()

    general = Room(name="General", type="open", creator_id=user.id)
    db.add(general)
    db.flush()
    db.add(Membership(room_id=general.id, user_id=user.id, involvement="everything"))
    db.commit()
    db.refresh(account)
    db.refresh(user)

    sess = _create_session(db, user, request)
    _set_session_cookie(response, sess.token)
    return {
        "account": serialize_account(account),
        "user": serialize_user(user, include_email=True),
        "token": sess.token,
    }


@router.post("/session")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce_rate_limit(request, "login", max_requests=10, window_seconds=60)
    ip = request.client.host if request.client else None
    if ip and db.query(Ban).filter(Ban.ip_address == ip).first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your IP address has been banned")

    user = db.query(User).filter(User.email_address == payload.email_address.strip().lower()).first()
    if not user or not verify_password(payload.password, user.password_digest):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Account is {user.status}")

    sess = _create_session(db, user, request)
    _set_session_cookie(response, sess.token)
    return {"user": serialize_user(user, include_email=True), "token": sess.token}


@router.delete("/session")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = get_session_token(request)
    if token:
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}


@router.get("/join/{join_code}")
def check_join_code(join_code: str, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.join_code == join_code).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link")
    return {"account": {"name": account.name, "logo_url": "/api/account/logo" if account.logo_path else None}}


@router.post("/join/{join_code}")
def join_account(join_code: str, payload: JoinRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce_rate_limit(request, "join", max_requests=10, window_seconds=60)
    account = db.query(Account).filter(Account.join_code == join_code).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link")

    ip = request.client.host if request.client else None
    if ip and db.query(Ban).filter(Ban.ip_address == ip).first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your IP address has been banned")

    email = payload.email_address.strip().lower()
    if db.query(User).filter(User.email_address == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

    user = User(
        name=payload.name.strip(),
        email_address=email,
        password_digest=hash_password(payload.password),
        role="member",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _join_open_rooms(db, user)

    sess = _create_session(db, user, request)
    _set_session_cookie(response, sess.token)
    return {"user": serialize_user(user, include_email=True), "token": sess.token}


@router.get("/account")
def get_account(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    account = db.query(Account).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"account": serialize_account(account)}


@router.patch("/account")
def update_account(payload: AccountUpdateRequest, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    account = db.query(Account).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if payload.name is not None:
        account.name = payload.name.strip()
    if payload.custom_styles is not None:
        account.custom_styles = payload.custom_styles
    account.updated_at = utcnow()
    db.commit()
    db.refresh(account)
    return {"account": serialize_account(account)}


@router.post("/account/join_code")
def regenerate_join_code(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    account = db.query(Account).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.join_code = secrets.token_urlsafe(12)
    account.updated_at = utcnow()
    db.commit()
    db.refresh(account)
    return {"account": serialize_account(account)}


@router.get("/account/logo")
def get_account_logo(db: Session = Depends(get_db)):
    account = db.query(Account).first()
    if not account or not account.logo_path or not Path(account.logo_path).exists():
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(account.logo_path)


@router.post("/account/logo")
def upload_account_logo(file: UploadFile = File(...), db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    account = db.query(Account).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    ext = validate_image_upload(file)
    dest = LOGOS_DIR / f"account_logo{ext}"
    save_upload_file(file, dest, max_bytes=MAX_IMAGE_BYTES)
    account.logo_path = str(dest)
    account.updated_at = utcnow()
    db.commit()
    db.refresh(account)
    return {"account": serialize_account(account)}


@router.delete("/account/logo")
def delete_account_logo(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    account = db.query(Account).first()
    if account and account.logo_path:
        p = Path(account.logo_path)
        if p.exists():
            p.unlink(missing_ok=True)
        account.logo_path = None
        account.updated_at = utcnow()
        db.commit()
    return {"ok": True}


@router.get("/account/users")
def list_account_users(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    users = db.query(User).filter(User.role != "bot").order_by(User.name.asc()).all()
    return {"users": [serialize_user(u, include_email=True) for u in users]}


@router.patch("/account/users/{user_id}")
def update_account_user(
    user_id: int,
    payload: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    target = db.query(User).filter(User.id == user_id, User.role != "bot").first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot modify your own role or ban yourself")
    if payload.role in ("member", "administrator"):
        target.role = payload.role
    if payload.status in ("active", "deactivated", "banned"):
        target.status = payload.status
        if payload.status == "banned":
            last_sess = db.query(UserSession).filter(UserSession.user_id == target.id).order_by(UserSession.created_at.desc()).first()
            if last_sess and last_sess.ip_address:
                db.add(Ban(user_id=target.id, ip_address=last_sess.ip_address))
        elif payload.status == "active":
            db.query(Ban).filter(Ban.user_id == target.id).delete()
    target.updated_at = utcnow()
    db.commit()
    db.refresh(target)
    return {"user": serialize_user(target, include_email=True)}


@router.get("/account/bots")
def list_bots(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    bots = db.query(User).filter(User.role == "bot").order_by(User.created_at.desc()).all()
    return {"bots": [serialize_user(b, include_bot_token=True) for b in bots]}


@router.post("/account/bots")
def create_bot(payload: BotCreateRequest, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    bot = User(
        name=payload.name.strip(),
        role="bot",
        status="active",
        bot_token=secrets.token_urlsafe(24),
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    _join_open_rooms(db, bot)
    return {"bot": serialize_user(bot, include_bot_token=True)}


@router.post("/account/bots/{bot_id}/regenerate_key")
def regenerate_bot_key(bot_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    bot = db.query(User).filter(User.id == bot_id, User.role == "bot").first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot.bot_token = secrets.token_urlsafe(24)
    bot.updated_at = utcnow()
    db.commit()
    db.refresh(bot)
    return {"bot": serialize_user(bot, include_bot_token=True)}


@router.delete("/account/bots/{bot_id}")
def delete_bot(bot_id: int, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    bot = db.query(User).filter(User.id == bot_id, User.role == "bot").first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    db.delete(bot)
    db.commit()
    return {"ok": True}
