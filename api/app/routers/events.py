"""M1 — events: list/search, recommendations, detail; plus user-added shows."""
import hashlib
import json
import re
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import artists, schemas, tickets
from ..db import EVENT_SQL, event_from_row, get_db, load_event, load_user, user_from_row
from ..ml import recommend

TZ = ZoneInfo("America/New_York")


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")

router = APIRouter(tags=["events"])


def friends_interested(conn, user: str, event_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT u.* FROM follows f JOIN attendance a ON a.user_id = f.followee_id JOIN users u ON u.id = a.user_id "
        "WHERE f.follower_id = ? AND a.event_id = ? AND a.status IN ('interested','going') ORDER BY u.name",
        (user, event_id))
    return [user_from_row(r) for r in rows]


@router.get("/events", response_model=list[schemas.EventWithFriends])
def list_events(user: str, upcoming: bool = True, q: Optional[str] = None, limit: int = 40, conn=Depends(get_db)):
    """Upcoming (or past) shows by date; with `q`, a search over artist, venue and genre across both,
    upcoming first (soonest first) then past (most recent first)."""
    if q and q.strip():
        like = f"%{q.strip()}%"
        rows = conn.execute(
            EVENT_SQL + " WHERE a.name LIKE ? OR v.name LIKE ? OR a.genres LIKE ? "
            "ORDER BY e.is_past, CASE WHEN e.is_past = 0 THEN e.start_at END ASC, "
            "CASE WHEN e.is_past = 1 THEN e.start_at END DESC LIMIT ?", (like, like, like, limit))
    else:
        rows = conn.execute(EVENT_SQL + " WHERE e.is_past = ? ORDER BY e.start_at " + ("ASC" if upcoming else "DESC"),
                            (0 if upcoming else 1,))
    return [{**event_from_row(r), "friends_interested": friends_interested(conn, user, r["id"])} for r in rows]


@router.get("/artists/search", response_model=list[schemas.ArtistHit])
def artist_search(q: str):
    return artists.search_artists(q)


def _resolve_venue(conn, venue: str) -> Optional[str]:
    """Our venue id for an id, a known name, or a new place (geocoded and added). None if unknown."""
    key = venue.strip()
    if not key:
        return None
    row = conn.execute("SELECT id FROM venues WHERE id = ? OR lower(name) = lower(?)", (key, key)).fetchone()
    if row is None:
        row = conn.execute("SELECT id FROM venues WHERE lower(name) LIKE lower(?) ORDER BY length(name) LIMIT 1",
                           (f"%{key}%",)).fetchone()
    if row:
        return row["id"]
    found = artists.geocode(key)
    if found is None:
        return None
    vid = slug(key)
    conn.execute("INSERT OR IGNORE INTO venues (id, name, lat, lng, geofence_radius_m, multi_room, access_profile, city)"
                 " VALUES (?,?,?,?,150,0,'{}',?)", (vid, key, found[0], found[1], found[2]))
    return vid


@router.post("/events", response_model=schemas.Event)
def create_event(body: schemas.EventCreateRequest, user: str, conn=Depends(get_db)):
    """Add a show the calendar doesn't have. Same artist + venue + night → the existing show."""
    if load_user(conn, user) is None:
        return JSONResponse(status_code=404, content={"error": "unknown_user"})
    try:
        day = date.fromisoformat(body.date)
        hhmm = datetime.strptime(body.time or "20:00", "%H:%M").time()
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "bad_date"})
    if not body.artist.strip():
        return JSONResponse(status_code=422, content={"error": "artist_required"})
    vid = _resolve_venue(conn, body.venue)
    if vid is None:
        return JSONResponse(status_code=422, content={"error": "venue_not_found"})
    meta = artists.artist_details(body.artist)
    aid = slug(meta["name"])
    if conn.execute("SELECT 1 FROM artists WHERE id = ?", (aid,)).fetchone() is None:
        conn.execute("INSERT INTO artists (id, name, genres, related) VALUES (?,?,?,?)",
                     (aid, meta["name"], "[]", json.dumps(meta["related"])))
    existing = conn.execute("SELECT id FROM events WHERE artist_id = ? AND venue_id = ? AND substr(start_at, 1, 10) = ?",
                            (aid, vid, day.isoformat())).fetchone()
    if existing:
        conn.commit()
        return load_event(conn, existing["id"])
    start = datetime.combine(day, hhmm).replace(tzinfo=TZ)
    eid = "u_" + hashlib.sha1(f"{aid}|{vid}|{day}".encode()).hexdigest()[:10]
    conn.execute(
        "INSERT INTO events (id, artist_id, venue_id, start_at, doors_at, price_min, price_max, tm_url, image_url,"
        " support, room, is_past, source) VALUES (?,?,?,?,NULL,NULL,NULL,NULL,?,?,NULL,?,'user')",
        (eid, aid, vid, start.isoformat(timespec="seconds"), meta["picture"], (body.support or "").strip() or None,
         int(day < datetime.now(TZ).date())))
    conn.commit()
    return load_event(conn, eid)


@router.get("/events/recommended", response_model=list[schemas.RecommendedEvent])
def recommended_events(user: str, limit: int = 5, conn=Depends(get_db)):
    return recommend.recommend(conn, user, limit)


@router.get("/events/{event_id}/tickets", response_model=list[schemas.TicketOffer])
def event_tickets(event_id: str, user: str, conn=Depends(get_db)):
    """Where to buy: the venue's seller plus resale, cheapest known price first (see app/tickets.py)."""
    event = load_event(conn, event_id)
    if event is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return tickets.offers(conn, event)


@router.get("/events/{event_id}", response_model=schemas.EventDetail)
def event_detail(event_id: str, user: str, conn=Depends(get_db)):
    event = load_event(conn, event_id)
    if event is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    row = conn.execute("SELECT status FROM attendance WHERE user_id = ? AND event_id = ?", (user, event_id)).fetchone()
    return {"event": event, "friends_interested": friends_interested(conn, user, event_id),
            "attendance": row["status"] if row else None}
