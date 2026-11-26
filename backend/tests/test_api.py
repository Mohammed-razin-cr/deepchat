import sys
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from starlette.websockets import WebSocketDisconnect

# Ensure `backend` is importable when running pytest from workspace root or backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import database, models  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Message, ScheduledMessage, UserSession, utcnow  # noqa: E402
from app.routers import auth_router, extras_router, messages_router, scheduled_router, users_router  # noqa: E402
from app.security import rate_limiter  # noqa: E402


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch):
    db_file = tmp_path / "test_deepchat.db"
    test_engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(test_engine, "connect")
    def set_pragma(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)

    monkeypatch.setattr(database, "engine", test_engine)
    monkeypatch.setattr(database, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(messages_router, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(scheduled_router, "SessionLocal", TestSessionLocal)

    uploads_dir = tmp_path / "uploads"
    avatars_dir = tmp_path / "avatars"
    logos_dir = tmp_path / "logos"
    for d in (uploads_dir, avatars_dir, logos_dir):
        d.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(extras_router, "UPLOADS_DIR", uploads_dir)
    monkeypatch.setattr(users_router, "AVATARS_DIR", avatars_dir)
    monkeypatch.setattr(auth_router, "LOGOS_DIR", logos_dir)

    database.init_db()
    rate_limiter.reset()

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[database.get_db] = override_get_db
    try:
        yield TestSessionLocal, uploads_dir
    finally:
        app.dependency_overrides.clear()
        rate_limiter.reset()
        test_engine.dispose()


def _bootstrap_admin(client: TestClient):
    res = client.post(
        "/api/first_run",
        json={
            "account_name": "DeepChat HQ",
            "name": "Alice Admin",
            "email_address": "alice@deepchat.test",
            "password": "password123",
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_auth_lifecycle_expiry_and_rate_limit(isolated_env):
    TestSessionLocal, _ = isolated_env
    with TestClient(app) as client:
        boot = client.get("/api/bootstrap")
        assert boot.status_code == 200
        assert boot.json()["needs_setup"] is True

        first = _bootstrap_admin(client)
        assert first["user"]["role"] == "administrator"
        assert first["account"]["name"] == "DeepChat HQ"

        # Second first_run must be rejected
        dup = client.post(
            "/api/first_run",
            json={
                "account_name": "Evil",
                "name": "Evil",
                "email_address": "evil@test.dev",
                "password": "password123",
            },
        )
        assert dup.status_code == 409

        # Self-ban & self-demote blocked
        admin_id = first["user"]["id"]
        self_ban = client.patch(f"/api/account/users/{admin_id}", json={"status": "banned"})
        assert self_ban.status_code == 400
        self_demote = client.patch(f"/api/account/users/{admin_id}", json={"role": "member"})
        assert self_demote.status_code == 400

        # Expire session in DB (>30 days old) -> rejected with 401
        with TestSessionLocal() as db:
            sess = db.query(UserSession).filter(UserSession.user_id == admin_id).first()
            assert sess is not None
            sess.created_at = utcnow() - timedelta(days=31)
            db.commit()

        me_expired = client.get("/api/users/me")
        assert me_expired.status_code == 401

        # Rate limit brute-force login after threshold (15/60s)
        rate_limiter.reset()
        statuses = []
        for _ in range(16):
            r = client.post(
                "/api/session",
                json={"email_address": "alice@deepchat.test", "password": "wrongpassword"},
            )
            statuses.append(r.status_code)
        assert 429 in statuses


def test_locked_room_server_enforcement(isolated_env):
    with TestClient(app) as admin_client, TestClient(app) as member_client:
        first = _bootstrap_admin(admin_client)
        join_code = first["account"]["join_code"]

        # Member joins workspace
        joined = member_client.post(
            f"/api/join/{join_code}",
            json={"name": "Bob Member", "email_address": "bob@deepchat.test", "password": "password123"},
        )
        assert joined.status_code == 200
        bob_id = joined.json()["user"]["id"]

        # Admin creates a closed passcode-locked room with Bob included
        created = admin_client.post(
            "/api/rooms",
            json={
                "name": "vault",
                "type": "closed",
                "member_ids": [bob_id],
                "passcode": "vault-pin-99",
            },
        )
        assert created.status_code == 200
        room = created.json()["room"]
        room_id = room["id"]
        assert room["is_locked"] is True
        assert room["unlocked"] is True  # creator session auto-unlocked

        # Admin posts a secret message in the locked vault
        posted = admin_client.post(
            f"/api/rooms/{room_id}/messages",
            json={"body": "Launch code ALPHA-999", "client_message_id": "msg-1"},
        )
        assert posted.status_code == 200
        secret_msg_id = posted.json()["message"]["id"]

        # Bob has NOT unlocked the vault in his session
        bob_rooms = member_client.get("/api/rooms").json()["rooms"]
        bob_vault = next(r for r in bob_rooms if r["id"] == room_id)
        assert bob_vault["is_locked"] is True
        assert bob_vault["unlocked"] is False

        assert member_client.get(f"/api/rooms/{room_id}/messages").status_code == 423
        assert (
            member_client.post(
                f"/api/rooms/{room_id}/messages",
                json={"body": "Bypass?", "client_message_id": "msg-2"},
            ).status_code
            == 423
        )
        assert member_client.post(f"/api/messages/{secret_msg_id}/pin").status_code == 423
        assert member_client.post(f"/api/messages/{secret_msg_id}/bookmark").status_code == 423

        # Search must NOT leak messages from locked rooms
        search_before = member_client.get("/api/searches?q=ALPHA-999")
        assert search_before.status_code == 200
        assert search_before.json()["results"] == []

        # Wrong passcode returns 403
        assert member_client.post(f"/api/rooms/{room_id}/unlock", json={"passcode": "wrong"}).status_code == 403

        # WebSocket refuses locked room without session unlock
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with member_client.websocket_connect(f"/ws/rooms/{room_id}"):
                pass
        assert exc_info.value.code == 4003

        # Unlock succeeds -> messages, search, bookmark, and WS work
        unlock_ok = member_client.post(f"/api/rooms/{room_id}/unlock", json={"passcode": "vault-pin-99"})
        assert unlock_ok.status_code == 200
        assert unlock_ok.json()["unlocked"] is True

        msgs_after = member_client.get(f"/api/rooms/{room_id}/messages")
        assert msgs_after.status_code == 200
        assert len(msgs_after.json()["messages"]) == 1

        search_after = member_client.get("/api/searches?q=ALPHA-999")
        assert len(search_after.json()["results"]) == 1

        bm = member_client.post(f"/api/messages/{secret_msg_id}/bookmark")
        assert bm.status_code == 200
        assert bm.json()["bookmarked"] is True
        assert member_client.get(f"/api/rooms/{room_id}/messages").json()["messages"][0]["is_bookmarked"] is True


def test_upload_xss_auth_limits_and_images(isolated_env):
    with TestClient(app) as admin_client, TestClient(app) as anon_client:
        _bootstrap_admin(admin_client)

        # SVG upload is stored safely & served only to authenticated users as attachment + nosniff
        up = admin_client.post(
            "/api/uploads",
            files={"file": ("xss.svg", b"<svg onload=alert(1)></svg>", "image/svg+xml")},
        )
        assert up.status_code == 200
        url = up.json()["attachment"]["url"]

        assert anon_client.get(url).status_code == 401
        fetched = admin_client.get(url)
        assert fetched.status_code == 200
        assert fetched.headers.get("x-content-type-options") == "nosniff"
        assert "attachment" in fetched.headers.get("content-disposition", "")

        # Over-sized upload rejected with 413
        too_big = b"x" * (25 * 1024 * 1024 + 10)
        big_res = admin_client.post(
            "/api/uploads",
            files={"file": ("huge.bin", too_big, "application/octet-stream")},
        )
        assert big_res.status_code == 413

        # Reject invalid image extension for avatar & logo
        bad_av = admin_client.post(
            "/api/users/me/avatar",
            files={"file": ("payload.html", b"<script>alert(1)</script>", "text/html")},
        )
        assert bad_av.status_code == 400

        bad_logo = admin_client.post(
            "/api/account/logo",
            files={"file": ("logo.svg", b"<svg/>", "image/svg+xml")},
        )
        assert bad_logo.status_code == 400

        # Valid PNG avatar and workspace logo upload + delete
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        good_av = admin_client.post("/api/users/me/avatar", files={"file": ("av.png", png_bytes, "image/png")})
        assert good_av.status_code == 200
        assert good_av.json()["user"]["avatar_url"]
        del_av = admin_client.delete("/api/users/me/avatar")
        assert del_av.status_code == 200
        assert del_av.json()["user"]["avatar_url"] is None

        good_logo = admin_client.post("/api/account/logo", files={"file": ("logo.png", png_bytes, "image/png")})
        assert good_logo.status_code == 200
        assert good_logo.json()["account"]["logo_url"]
        assert admin_client.delete("/api/account/logo").status_code == 200


def test_unfurl_ssrf_protection(isolated_env):
    with TestClient(app) as client:
        _bootstrap_admin(client)
        for bad_url in (
            "http://127.0.0.1:8000/secret",
            "http://localhost:3000/api/bootstrap",
            "http://169.254.169.254/latest/meta-data/",
            "ftp://example.com/file",
        ):
            r = client.post("/api/unfurl", json={"url": bad_url})
            assert r.status_code == 400, f"Expected 400 for {bad_url}, got {r.status_code}"

        # DNS resolving to private IP must also be blocked
        with patch("app.security.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.5", 443))]):
            r_priv = client.post("/api/unfurl", json={"url": "https://internal.corp.example/admin"})
            assert r_priv.status_code == 400


def test_polls_disappearing_messages_and_bot_key_rotation(isolated_env):
    TestSessionLocal, _ = isolated_env
    with TestClient(app) as client:
        _bootstrap_admin(client)

        # Create room with disappearing messages
        room_res = client.post(
            "/api/rooms",
            json={"name": "ephemeral", "type": "open", "disappear_seconds": 60},
        )
        assert room_res.status_code == 200
        room_id = room_res.json()["room"]["id"]

        # Empty edit blocked on text-only messages
        text_msg = client.post(
            f"/api/rooms/{room_id}/messages",
            json={"body": "Temporary text", "client_message_id": "text-1"},
        )
        assert text_msg.status_code == 200
        text_msg_id = text_msg.json()["message"]["id"]
        assert client.patch(f"/api/messages/{text_msg_id}", json={"body": "   "}).status_code == 400
        assert client.delete(f"/api/messages/{text_msg_id}").status_code == 200

        # Poll message + expiration check
        poll_msg = client.post(
            f"/api/rooms/{room_id}/messages",
            json={
                "body": "Vote now",
                "client_message_id": "poll-1",
                "poll": {
                    "question": "Best stack?",
                    "options": [{"id": 1, "text": "FastAPI", "votes": []}, {"id": 2, "text": "Go", "votes": []}],
                },
            },
        )
        assert poll_msg.status_code == 200
        msg_id = poll_msg.json()["message"]["id"]
        assert poll_msg.json()["message"]["expires_at"] is not None

        # Vote on poll
        voted = client.post(f"/api/messages/{msg_id}/vote", json={"option_id": 1})
        assert voted.status_code == 200
        assert len(voted.json()["message"]["poll"]["options"][0]["votes"]) == 1

        # Expire message in DB -> auto-purged on listMessages and messages_count decrements
        with TestSessionLocal() as db:
            m = db.query(Message).filter(Message.id == msg_id).first()
            assert m is not None
            m.expires_at = utcnow() - timedelta(seconds=10)
            db.commit()

        after_purge = client.get(f"/api/rooms/{room_id}/messages")
        assert after_purge.status_code == 200
        assert after_purge.json()["messages"] == []
        assert client.get(f"/api/rooms/{room_id}").json()["room"]["messages_count"] == 0

        # Bot API + key regeneration invalidates old key
        bot = client.post("/api/account/bots", json={"name": "DeployBot"}).json()["bot"]
        old_token = bot["bot_token"]
        r1 = client.post(
            f"/api/rooms/{room_id}/{old_token}/messages",
            json={"body": "Deploy started", "client_message_id": "bot-1"},
        )
        assert r1.status_code == 200

        regen = client.post(f"/api/account/bots/{bot['id']}/regenerate_key").json()["bot"]
        new_token = regen["bot_token"]
        assert new_token != old_token

        assert (
            client.post(
                f"/api/rooms/{room_id}/{old_token}/messages",
                json={"body": "Old token", "client_message_id": "bot-2"},
            ).status_code
            == 401
        )
        assert (
            client.post(
                f"/api/rooms/{room_id}/{new_token}/messages",
                json={"body": "New token ok", "client_message_id": "bot-3"},
            ).status_code
            == 200
        )


def test_topics_stars_threads_and_room_tasks(isolated_env):
    with TestClient(app) as admin_client, TestClient(app) as member_client:
        first = _bootstrap_admin(admin_client)
        join_code = first["account"]["join_code"]
        bob = member_client.post(
            f"/api/join/{join_code}",
            json={"name": "Bob", "email_address": "bob@deepchat.test", "password": "password123"},
        ).json()["user"]

        # Create room with topic and passcode lock
        created = admin_client.post(
            "/api/rooms",
            json={
                "name": "roadmap",
                "topic": "Q4 Launch Milestones",
                "type": "closed",
                "member_ids": [bob["id"]],
                "passcode": "pin42",
            },
        )
        assert created.status_code == 200
        room = created.json()["room"]
        room_id = room["id"]
        assert room["topic"] == "Q4 Launch Milestones"

        # Toggle room star
        star1 = admin_client.post(f"/api/rooms/{room_id}/star")
        assert star1.status_code == 200
        assert star1.json()["starred"] is True
        rooms_after_star = admin_client.get("/api/rooms").json()["rooms"]
        assert next(r for r in rooms_after_star if r["id"] == room_id)["is_starred"] is True

        # Update topic
        updated = admin_client.patch(f"/api/rooms/{room_id}", json={"topic": "Updated Q4 Scope"})
        assert updated.status_code == 200
        assert updated.json()["room"]["topic"] == "Updated Q4 Scope"

        # Post parent + thread reply -> verify replies_count & thread endpoint
        parent = admin_client.post(
            f"/api/rooms/{room_id}/messages",
            json={"body": "Parent topic", "client_message_id": "th-0"},
        ).json()["message"]
        reply = admin_client.post(
            f"/api/rooms/{room_id}/messages",
            json={"body": "Thread reply 1", "client_message_id": "th-1", "reply_to_id": parent["id"]},
        ).json()["message"]
        assert reply["reply_to_id"] == parent["id"]

        listed = admin_client.get(f"/api/rooms/{room_id}/messages").json()["messages"]
        assert next(m for m in listed if m["id"] == parent["id"])["replies_count"] == 1

        # Locked room denies Bob access to thread and tasks until unlocked
        assert member_client.get(f"/api/messages/{parent['id']}/thread").status_code == 423
        assert member_client.get(f"/api/rooms/{room_id}/tasks").status_code == 423
        assert member_client.post(f"/api/rooms/{room_id}/tasks", json={"title": "Sneaky"}).status_code == 423

        assert member_client.post(f"/api/rooms/{room_id}/unlock", json={"passcode": "pin42"}).status_code == 200
        thread = member_client.get(f"/api/messages/{parent['id']}/thread")
        assert thread.status_code == 200
        assert thread.json()["parent"]["id"] == parent["id"]
        assert [r["body"] for r in thread.json()["replies"]] == ["Thread reply 1"]

        # Shared Room Tasks CRUD
        t_create = admin_client.post(f"/api/rooms/{room_id}/tasks", json={"title": "Ship release notes"})
        assert t_create.status_code == 200
        task_id = t_create.json()["task"]["id"]

        t_done = member_client.patch(f"/api/tasks/{task_id}", json={"completed": True})
        assert t_done.status_code == 200
        assert t_done.json()["task"]["completed"] is True
        assert t_done.json()["task"]["completed_by_name"] == "Bob"

        t_list = member_client.get(f"/api/rooms/{room_id}/tasks").json()["tasks"]
        assert len(t_list) == 1
        assert admin_client.delete(f"/api/tasks/{task_id}").status_code == 200
        assert admin_client.get(f"/api/rooms/{room_id}/tasks").json()["tasks"] == []


def test_mentions_inbox_and_scheduled_messages(isolated_env):
    import asyncio
    TestSessionLocal, _ = isolated_env
    with TestClient(app) as admin_client, TestClient(app) as member_client:
        first = _bootstrap_admin(admin_client)
        join_code = first["account"]["join_code"]
        bob = member_client.post(
            f"/api/join/{join_code}",
            json={"name": "Bob", "email_address": "bob@deepchat.test", "password": "password123"},
        ).json()["user"]

        # Open room + Locked room
        open_room_id = admin_client.get("/api/rooms").json()["rooms"][0]["id"]
        locked_room_id = admin_client.post(
            "/api/rooms",
            json={"name": "secret-ops", "type": "closed", "member_ids": [bob["id"]], "passcode": "999"},
        ).json()["room"]["id"]

        # Mentions in both rooms; Bob hasn't unlocked secret-ops yet
        admin_client.post(
            f"/api/rooms/{open_room_id}/messages",
            json={"body": "Hey @Bob please check this", "client_message_id": "m-open"},
        )
        admin_client.post(
            f"/api/rooms/{locked_room_id}/messages",
            json={"body": "Secret ping @Bob", "client_message_id": "m-locked"},
        )

        mentions_before = member_client.get("/api/mentions").json()["mentions"]
        assert [m["body"] for m in mentions_before] == ["Hey @Bob please check this"]

        member_client.post(f"/api/rooms/{locked_room_id}/unlock", json={"passcode": "999"})
        mentions_after = member_client.get("/api/mentions").json()["mentions"]
        assert len(mentions_after) == 2

        # Scheduled messages validation + send_now + background dispatch
        past = (utcnow() - timedelta(minutes=5)).isoformat() + "Z"
        future = (utcnow() + timedelta(hours=1)).isoformat() + "Z"
        assert (
            admin_client.post(
                f"/api/rooms/{open_room_id}/scheduled",
                json={"body": "Past message", "send_at": past},
            ).status_code
            == 400
        )
        assert (
            admin_client.post(
                f"/api/rooms/{open_room_id}/scheduled",
                json={"body": "   ", "send_at": future},
            ).status_code
            == 400
        )

        s1 = admin_client.post(
            f"/api/rooms/{open_room_id}/scheduled",
            json={"body": "Send immediately test", "send_at": future},
        ).json()["scheduled"]
        s2 = admin_client.post(
            f"/api/rooms/{open_room_id}/scheduled",
            json={"body": "Due dispatch test", "send_at": future},
        ).json()["scheduled"]
        assert len(admin_client.get(f"/api/rooms/{open_room_id}/scheduled").json()["scheduled"]) == 2

        sent_now = admin_client.post(f"/api/scheduled/{s1['id']}/send_now")
        assert sent_now.status_code == 200
        assert sent_now.json()["message"]["body"] == "Send immediately test"

        # Fast-forward s2 due timestamp in DB & run dispatcher
        with TestSessionLocal() as db:
            row = db.query(ScheduledMessage).filter(ScheduledMessage.id == s2["id"]).first()
            assert row is not None
            row.send_at = utcnow() - timedelta(seconds=5)
            db.commit()

        asyncio.run(scheduled_router.dispatch_due_scheduled_messages())
        assert admin_client.get(f"/api/rooms/{open_room_id}/scheduled").json()["scheduled"] == []
        bodies = [m["body"] for m in admin_client.get(f"/api/rooms/{open_room_id}/messages").json()["messages"]]
        assert "Due dispatch test" in bodies
