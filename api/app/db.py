"""sqlite3 connection helper and shared row -> contract loaders.

The DB path defaults to <repo>/data/encore.db and can be overridden with the
ENCORE_DB environment variable (tests point it at a temp file).
"""
import json
import os
import sqlite3
from pathlib import Path
from typing import Iterator, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "data" / "encore.db"


def db_path() -> Path:
    return Path(os.environ.get("ENCORE_DB", DEFAULT_DB))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


# ---- loaders: rows -> dicts shaped like schemas.py ------------------------

def user_from_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "avatar": row["avatar"] or "",
        "budget_max": row["budget_max"],
        "accessibility_needs": json.loads(row["accessibility_needs"] or "[]"),
        "verified": bool(row["verified"]),
        "weights": json.loads(row["weights"]),
    }


def load_user(conn: sqlite3.Connection, user_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return user_from_row(row) if row else None


def load_users(conn: sqlite3.Connection, user_ids: list[str]) -> list[dict]:
    """Users in the given order; unknown ids are skipped."""
    users = (load_user(conn, uid) for uid in user_ids)
    return [u for u in users if u is not None]


EVENT_SQL = """
SELECT e.*, a.name AS artist_name, a.genres AS artist_genres,
       v.name AS venue_name, v.lat, v.lng, v.multi_room, v.access_profile
FROM events e
JOIN artists a ON a.id = e.artist_id
JOIN venues v ON v.id = e.venue_id
"""

_DEFAULT_ACCESS = {
    "step_free": False,
    "ada_seating": False,
    "quiet_room": False,
    "strobe_policy": "unrestricted",
    "interpreter": "never",
}


def event_from_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "artist": {
            "id": row["artist_id"],
            "name": row["artist_name"],
            "genres": json.loads(row["artist_genres"] or "[]"),
        },
        "venue": {
            "id": row["venue_id"],
            "name": row["venue_name"],
            "lat": row["lat"],
            "lng": row["lng"],
            "multi_room": bool(row["multi_room"]),
            # Auto-created venues have an empty profile; assume the worst.
            "access_profile": {**_DEFAULT_ACCESS, **json.loads(row["access_profile"] or "{}")},
        },
        "start_at": row["start_at"],
        "doors_at": row["doors_at"],
        "price_min": row["price_min"],
        "price_max": row["price_max"],
        "tm_url": row["tm_url"],
        "image_url": row["image_url"] if "image_url" in row.keys() else None,
        "support": row["support"] if "support" in row.keys() else None,
        "room": row["room"] if "room" in row.keys() else None,
        "is_past": bool(row["is_past"]),
    }


def load_event(conn: sqlite3.Connection, event_id: str) -> Optional[dict]:
    row = conn.execute(EVENT_SQL + " WHERE e.id = ?", (event_id,)).fetchone()
    return event_from_row(row) if row else None


def following(conn: sqlite3.Connection, user_id: str) -> set[str]:
    rows = conn.execute("SELECT followee_id FROM follows WHERE follower_id = ?", (user_id,))
    return {r[0] for r in rows}


def is_verified(conn: sqlite3.Connection, user_id: str) -> bool:
    row = conn.execute("SELECT verified FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row and row[0])
