"""Where uploaded photos and videos live.

Metadata is in SQLite (the `media` table); the bytes go to a provider chosen by MEDIA_STORAGE:
  local     (default) files under MEDIA_ROOT (data/media/), served by the API at /media-files/… so the demo
            works on one laptop with nothing else running
  supabase  a Supabase Storage bucket — hosted, so phones and laptops share the same photos:
            SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET (a public bucket)
Rows store what the provider returned from put(): a root-relative path (local) or the public URL (supabase),
so the database stays host-independent and can be seeded deterministically.
"""
import os
from pathlib import Path
from typing import Protocol

import httpx

from .db import REPO_ROOT


def media_root() -> Path:
    return Path(os.environ.get("MEDIA_ROOT", REPO_ROOT / "data" / "media"))


def public_base() -> str:
    return os.environ.get("MEDIA_PUBLIC_BASE", f"http://localhost:{os.environ.get('API_PORT', '8000')}/media-files").rstrip("/")


class Storage(Protocol):
    name: str

    def put(self, path: str, data: bytes, content_type: str) -> str: ...
    def delete(self, stored: str) -> None: ...
    def url(self, stored: str) -> str: ...


class LocalStorage:
    name = "local"

    def put(self, path: str, data: bytes, content_type: str) -> str:
        dest = media_root() / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return path

    def delete(self, stored: str) -> None:
        if not stored.startswith("http"):
            (media_root() / stored).unlink(missing_ok=True)

    def url(self, stored: str) -> str:
        return stored if stored.startswith("http") else f"{public_base()}/{stored}"


class SupabaseStorage:
    name = "supabase"

    def __init__(self, url: str, key: str, bucket: str):
        self.base, self.key, self.bucket = url.rstrip("/"), key, bucket

    def _headers(self, content_type: str | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.key}", "apikey": self.key}
        if content_type:
            h["Content-Type"] = content_type
        return h

    def put(self, path: str, data: bytes, content_type: str) -> str:
        r = httpx.post(f"{self.base}/storage/v1/object/{self.bucket}/{path}", content=data,
                       headers={**self._headers(content_type), "x-upsert": "true"}, timeout=120)
        r.raise_for_status()
        return f"{self.base}/storage/v1/object/public/{self.bucket}/{path}"

    def delete(self, stored: str) -> None:
        prefix = f"{self.base}/storage/v1/object/public/{self.bucket}/"
        if stored.startswith(prefix):
            httpx.delete(f"{self.base}/storage/v1/object/{self.bucket}/{stored[len(prefix):]}",
                         headers=self._headers(), timeout=30)

    def url(self, stored: str) -> str:
        return stored


def storage() -> Storage:
    """The configured provider; falls back to local storage when Supabase isn't fully configured."""
    if os.environ.get("MEDIA_STORAGE", "local").strip().lower() == "supabase":
        url, key, bucket = (os.environ.get(k, "").strip() for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET"))
        if url and key and bucket:
            return SupabaseStorage(url, key, bucket)
    return LocalStorage()
