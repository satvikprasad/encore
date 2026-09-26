"""Verification gate (AGENTS.md §6). Unverified users get 403 verification_required on:
  - GET /matches/*
  - POST /crews when any member_id is not a direct follow of the caller
  - POST /crews/{id}/messages when the crew contains a non-follow of the caller
"""
import json
import re
import sqlite3

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .db import connect, db_path, following, is_verified

_MESSAGES = re.compile(r"^/crews/([^/]+)/messages/?$")


def _has_stranger(conn: sqlite3.Connection, user: str, member_ids: list[str]) -> bool:
    friends = following(conn, user)
    return any(m != user and m not in friends for m in member_ids)


def needs_verification(conn: sqlite3.Connection, method: str, path: str, user: str, body: bytes) -> bool:
    """True if this request is gated for `user`, ignoring their verified status."""
    if method == "GET" and path.startswith("/matches/"):
        return True
    if method == "POST" and path.rstrip("/") == "/crews":
        try:
            member_ids = json.loads(body or b"{}").get("member_ids", [])
        except (ValueError, AttributeError):
            return False  # malformed body: let validation return 422
        return isinstance(member_ids, list) and _has_stranger(conn, user, member_ids)
    m = _MESSAGES.match(path)
    if method == "POST" and m:
        row = conn.execute("SELECT member_ids FROM crews WHERE id = ?", (m.group(1),)).fetchone()
        return row is not None and _has_stranger(conn, user, json.loads(row[0]))
    return False


class VerificationGate(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        user = request.query_params.get("user")
        path, method = request.url.path, request.method
        gated_route = path.startswith(("/matches/", "/crews"))
        if user and gated_route and db_path().exists():
            body = await request.body() if method == "POST" else b""
            conn = connect()
            try:
                blocked = needs_verification(conn, method, path, user, body) and not is_verified(conn, user)
            finally:
                conn.close()
            if blocked:
                return JSONResponse(status_code=403, content={"error": "verification_required"})
        return await call_next(request)
