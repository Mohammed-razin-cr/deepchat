import datetime as dt
import bcrypt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import User, UserSession, utcnow


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_digest: str | None) -> bool:
    if not password_digest:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_digest.encode("utf-8"))
    except Exception:
        return False


def get_session_token(request: Request) -> str | None:
    cookie_token = request.cookies.get(settings.session_cookie_name)
    if cookie_token:
        return cookie_token
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_session_optional(request: Request, db: Session = Depends(get_db)) -> UserSession | None:
    token = get_session_token(request)
    if not token:
        return None
    sess = db.query(UserSession).filter(UserSession.token == token).first()
    if not sess:
        return None
    if sess.created_at + dt.timedelta(seconds=settings.session_max_age) < utcnow():
        db.delete(sess)
        db.commit()
        return None
    user = sess.user
    if not user or user.status != "active":
        return None
    sess.last_active_at = utcnow()
    db.commit()
    return sess


def get_current_user_optional(sess: UserSession | None = Depends(get_session_optional)) -> User | None:
    return sess.user if sess else None


def get_current_session(sess: UserSession | None = Depends(get_session_optional)) -> UserSession:
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return sess


def get_current_user(user: User | None = Depends(get_current_user_optional)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "administrator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user
