import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
AVATARS_DIR = STORAGE_DIR / "avatars"
LOGOS_DIR = STORAGE_DIR / "logos"
DB_PATH = STORAGE_DIR / "deepchat.db"
VAPID_FILE = STORAGE_DIR / "vapid.json"

for d in (STORAGE_DIR, UPLOADS_DIR, AVATARS_DIR, LOGOS_DIR):
    d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    app_name: str = "DeepChat"
    secret_key: str = os.environ.get("SECRET_KEY_BASE", secrets.token_urlsafe(32))
    database_url: str = f"sqlite:///{DB_PATH.as_posix()}"
    session_cookie_name: str = "deepchat_session"
    session_max_age: int = 60 * 60 * 24 * 30  # 30 days


settings = Settings()
