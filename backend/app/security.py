import ipaddress
import re
import socket
import time
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse
from fastapi import HTTPException, Request, UploadFile, status

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MiB
MAX_IMAGE_BYTES = 5 * 1024 * 1024    # 5 MiB

ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
SAFE_INLINE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mp3", ".ogg", ".wav", ".pdf", ".txt"}


class SlidingWindowRateLimiter:
    def __init__(self):
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, max_requests: int, window_seconds: int):
        now = time.monotonic()
        bucket = self._hits[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again shortly.",
            )
        bucket.append(now)

    def reset(self):
        self._hits.clear()


rate_limiter = SlidingWindowRateLimiter()


def enforce_rate_limit(request: Request, scope: str, max_requests: int = 10, window_seconds: int = 60):
    ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"{scope}:{ip}", max_requests, window_seconds)


def sanitize_filename(raw_name: str | None) -> str:
    base = Path(raw_name or "file").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._")
    return cleaned[:120] or "file"


def _is_forbidden_ip(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def validate_public_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")
    host = parsed.hostname
    if host.lower() in ("localhost", "ip6-localhost"):
        raise HTTPException(status_code=400, detail="Blocked private or local URL")
    try:
        addr_info = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Unable to resolve host")
    if not addr_info:
        raise HTTPException(status_code=400, detail="Unable to resolve host")
    for item in addr_info:
        ip_str = item[4][0]
        if _is_forbidden_ip(ip_str):
            raise HTTPException(status_code=400, detail="Blocked private or internal network URL")
    return url.strip()


def save_upload_file(file: UploadFile, dest: Path, max_bytes: int = MAX_UPLOAD_BYTES) -> int:
    total = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = file.file.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB",
                    )
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    return total


def validate_image_upload(file: UploadFile) -> str:
    ext = Path(file.filename or "").suffix.lower()
    ctype = (file.content_type or "").lower()
    if ext not in ALLOWED_IMAGE_EXTS or not ctype.startswith("image/") or ext == ".svg" or "svg" in ctype:
        raise HTTPException(
            status_code=400,
            detail="Only PNG, JPG, GIF, or WebP images are allowed",
        )
    return ext
