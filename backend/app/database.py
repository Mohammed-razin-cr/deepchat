from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(messages)")).fetchall()}
        if "reply_to_id" not in cols:
            conn.execute(text("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL"))
        if "is_pinned" not in cols:
            conn.execute(text("ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"))
        if "poll_json" not in cols:
            conn.execute(text("ALTER TABLE messages ADD COLUMN poll_json JSON"))
        if "expires_at" not in cols:
            conn.execute(text("ALTER TABLE messages ADD COLUMN expires_at DATETIME"))
        room_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(rooms)")).fetchall()}
        if "passcode_hash" not in room_cols:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN passcode_hash VARCHAR(255)"))
        if "disappear_seconds" not in room_cols:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN disappear_seconds INTEGER"))
        if "topic" not in room_cols:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN topic VARCHAR(280)"))
        mem_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(memberships)")).fetchall()}
        if "is_starred" not in mem_cols:
            conn.execute(text("ALTER TABLE memberships ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0"))
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        if "status_emoji" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN status_emoji VARCHAR(16)"))
        if "status_text" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN status_text VARCHAR(80)"))
        conn.execute(
            text(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    message_id UNINDEXED,
                    room_id UNINDEXED,
                    body
                )
                """
            )
        )
