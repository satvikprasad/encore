"""M1 — events: list/search, recommendations, detail."""
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas, tickets
from ..db import EVENT_SQL, event_from_row, get_db, load_event, user_from_row
from ..ml import recommend

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
