import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..auth import get_current_user, hash_password
from ..config import AVATARS_DIR
from ..database import get_db
from ..models import User, utcnow
from ..schemas import ProfileUpdateRequest
from ..security import MAX_IMAGE_BYTES, save_upload_file, validate_image_upload
from ..serializers import serialize_user

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users")
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(User.status == "active").order_by(User.name.asc()).all()
    return {"users": [serialize_user(u) for u in users]}


@router.get("/users/autocomplete")
def autocomplete_users(q: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(User).filter(User.status == "active")
    if q.strip():
        query = query.filter(User.name.ilike(f"%{q.strip()}%"))
    users = query.order_by(User.name.asc()).limit(10).all()
    return {"users": [serialize_user(u) for u in users]}


@router.get("/users/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"user": serialize_user(current_user, include_email=True)}


@router.patch("/users/me")
def update_me(payload: ProfileUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.email_address is not None:
        email = payload.email_address.strip().lower()
        existing = db.query(User).filter(User.email_address == email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email_address = email
    if payload.bio is not None:
        current_user.bio = payload.bio
    if payload.status_emoji is not None:
        current_user.status_emoji = payload.status_emoji
    if payload.status_text is not None:
        current_user.status_text = payload.status_text
    if payload.password:
        current_user.password_digest = hash_password(payload.password)
    current_user.updated_at = utcnow()
    db.commit()
    db.refresh(current_user)
    return {"user": serialize_user(current_user, include_email=True)}


@router.get("/users/{user_id}/avatar")
def get_user_avatar(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.avatar_path or not Path(user.avatar_path).exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(user.avatar_path)


@router.post("/users/me/avatar")
def upload_my_avatar(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ext = validate_image_upload(file)
    dest = AVATARS_DIR / f"user_{current_user.id}{ext}"
    save_upload_file(file, dest, max_bytes=MAX_IMAGE_BYTES)
    current_user.avatar_path = str(dest)
    current_user.updated_at = utcnow()
    db.commit()
    db.refresh(current_user)
    return {"user": serialize_user(current_user, include_email=True)}


@router.delete("/users/me/avatar")
def delete_my_avatar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.avatar_path:
        Path(current_user.avatar_path).unlink(missing_ok=True)
        current_user.avatar_path = None
        current_user.updated_at = utcnow()
        db.commit()
    return {"user": serialize_user(current_user, include_email=True)}
