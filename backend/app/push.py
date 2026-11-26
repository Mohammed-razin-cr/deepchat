import base64
import json
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session
from .config import VAPID_FILE
from .models import PushSubscription


def _ensure_vapid_keys() -> dict:
    if VAPID_FILE.exists():
        return json.loads(VAPID_FILE.read_text(encoding="utf-8"))

    private_key = ec.generate_private_key(ec.SECP256R1())
    raw_priv = private_key.private_numbers().private_value.to_bytes(32, "big")
    raw_pub = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    keys = {
        "private_key": base64.urlsafe_b64encode(raw_priv).rstrip(b"=").decode("ascii"),
        "public_key": base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode("ascii"),
    }
    VAPID_FILE.write_text(json.dumps(keys, indent=2), encoding="utf-8")
    return keys


def get_vapid_public_key() -> str:
    return _ensure_vapid_keys()["public_key"]


def send_push_to_user(db: Session, user_id: int, title: str, body: str, url: str = "/"):
    keys = _ensure_vapid_keys()
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    payload = json.dumps({"title": title, "body": body, "url": url})
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
                },
                data=payload,
                vapid_private_key=keys["private_key"],
                vapid_claims={"sub": "mailto:admin@deepchat.local"},
            )
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                db.delete(sub)
        except Exception:
            pass
    db.commit()
