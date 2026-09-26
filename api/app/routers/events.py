"""M1 — events."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..db import EVENT_SQL, event_from_row, get_db, load_event, user_from_row

router = APIRouter(tags=["events"])


def friends_interested(conn, user: str, event_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT u.* FROM follows f JOIN attendance a ON a.user_id = f.followee_id JOIN users u ON u.id = a.user_id "
        "WHERE f.follower_id = ? AND a.event_id = ? AND a.status IN ('interested','going') ORDER BY u.name",
        (user, event_id))
    return [user_from_row(r) for r in rows]


@router.get("/events", response_model=list[schemas.EventWithFriends])
def list_events(user: str, upcoming: bool = True, conn=Depends(get_db)):
    rows = conn.execute(EVENT_SQL + " WHERE e.is_past = ? ORDER BY e.start_at " + ("ASC" if upcoming else "DESC"),
                        (0 if upcoming else 1,))
    return [{**event_from_row(r), "friends_interested": friends_interested(conn, user, r["id"])} for r in rows]


@router.get("/events/{event_id}", response_model=schemas.EventDetail)
def event_detail(event_id: str, user: str, conn=Depends(get_db)):
    event = load_event(conn, event_id)
    if event is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    row = conn.execute("SELECT status FROM attendance WHERE user_id = ? AND event_id = ?", (user, event_id)).fetchone()
    return {"event": event, "friends_interested": friends_interested(conn, user, event_id),
            "attendance": row["status"] if row else None}
