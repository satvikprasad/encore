"""Photos and videos of shows. You upload yours; the people who follow you see them on the show page,
on your profile, and in their home feed ("Friends' moments"). Bytes live in app/storage.py's provider.

Uploads are a raw request body (Content-Type = the file's type) — one request per file, so no multipart
parser is needed and the browser can report progress per file.
"""
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse

from .. import schemas
from ..db import following, get_db, load_event, load_user
from ..storage import media_root, storage

router = APIRouter(tags=["media"])

ALLOWED = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "image/heic": ".heic", "image/heif": ".heif",
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
}
MAX_BYTES = 80 * 1024 * 1024
FEED_LIMIT = 30


def media_from_row(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "user": load_user(conn, row["user_id"]),
        "event": load_event(conn, row["event_id"]),
        "kind": row["kind"],
        "url": storage().url(row["path"]),
        "content_type": row["content_type"],
        "bytes": row["bytes"],
        "caption": row["caption"],
        "taken_at": row["taken_at"],
        "created_at": row["created_at"],
    }


def _visible_owners(conn: sqlite3.Connection, user: str) -> set[str]:
    """Whose media the caller can see: their own and everyone they follow."""
    return following(conn, user) | {user}


@router.post("/media/upload", response_model=schemas.MediaFile)
async def upload(request: Request, user: str, event: str, name: str = "photo", caption: Optional[str] = None,
                 taken_at: Optional[str] = None, conn=Depends(get_db)):
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype not in ALLOWED:
        return JSONResponse(status_code=415, content={"error": "unsupported_type"})
    if load_user(conn, user) is None or load_event(conn, event) is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_BYTES:
            return JSONResponse(status_code=413, content={"error": "too_large"})
    if not data:
        return JSONResponse(status_code=400, content={"error": "empty"})
    mid = "m_" + secrets.token_hex(8)
    stored = storage().put(f"{user}/{event}/{mid}{ALLOWED[ctype]}", bytes(data), ctype)
    conn.execute(
        "INSERT INTO media (id, user_id, event_id, kind, path, content_type, bytes, caption, taken_at, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (mid, user, event, "video" if ctype.startswith("video/") else "image", stored, ctype, len(data),
         (caption or "").strip() or None, taken_at, datetime.now(timezone.utc).isoformat(timespec="seconds")))
    conn.commit()
    return media_from_row(conn, conn.execute("SELECT * FROM media WHERE id = ?", (mid,)).fetchone())


@router.get("/media/feed", response_model=list[schemas.MediaFile])
def feed(user: str, limit: int = FEED_LIMIT, conn=Depends(get_db)):
    """Friends' moments: the latest photos and videos from people the caller follows."""
    owners = sorted(following(conn, user))
    if not owners:
        return []
    marks = ",".join("?" * len(owners))
    rows = conn.execute(f"SELECT * FROM media WHERE user_id IN ({marks}) ORDER BY created_at DESC, id LIMIT ?",
                        (*owners, limit))
    return [media_from_row(conn, r) for r in rows]


@router.get("/media", response_model=list[schemas.MediaFile])
def list_media(user: str, event: Optional[str] = None, of: Optional[str] = None, limit: int = 100, conn=Depends(get_db)):
    """Media for a show (the caller's own plus people they follow) and/or one member's media
    (visible when the caller follows them or is them; otherwise empty)."""
    if not event and not of:
        return JSONResponse(status_code=400, content={"error": "event_or_of_required"})
    owners = _visible_owners(conn, user)
    where, params = [], []
    if event:
        where.append("event_id = ?")
        params.append(event)
    if of:
        if of not in owners:
            return []
        where.append("user_id = ?")
        params.append(of)
    else:
        where.append(f"user_id IN ({','.join('?' * len(owners))})")
        params += sorted(owners)
    rows = conn.execute(f"SELECT * FROM media WHERE {' AND '.join(where)} ORDER BY created_at DESC, id LIMIT ?",
                        (*params, limit))
    return [media_from_row(conn, r) for r in rows]


@router.delete("/media/{media_id}", response_model=schemas.OkResponse)
def delete_media(media_id: str, user: str, conn=Depends(get_db)):
    row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if row["user_id"] != user:
        return JSONResponse(status_code=403, content={"error": "not_owner"})
    storage().delete(row["path"])
    conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
    conn.commit()
    return {"ok": True}


@router.get("/media-files/{path:path}", include_in_schema=False)
def serve(path: str):
    """Local-storage files (the default provider). Supabase URLs never come here."""
    root = media_root().resolve()
    full = (root / path).resolve()
    if root not in full.parents or not full.is_file():
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return FileResponse(str(full))
