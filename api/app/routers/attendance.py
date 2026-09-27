"""Attendance: mark a show (want to go / going / went) and the "went but not ranked" prompt."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..constants import RANKER
from ..db import EVENT_SQL, event_from_row, get_db, load_event
from .reviews import add_provisional_review

router = APIRouter(tags=["attendance"])

# add_provisional_review stores a guessed review at double the prior variance; a real review resets it.
PROVISIONAL_VAR = 2 * RANKER["prior_var"]


def mark_attended(conn, user: str, event_id: str, evidence: str = "manual", confidence: float = 1.0) -> bool:
    """Upsert an 'attended' row and give the show a provisional review. True if newly attended."""
    prev = conn.execute("SELECT status FROM attendance WHERE user_id = ? AND event_id = ?",
                        (user, event_id)).fetchone()
    conn.execute("INSERT INTO attendance (user_id, event_id, status, evidence, confidence) "
                 "VALUES (?, ?, 'attended', ?, ?) ON CONFLICT(user_id, event_id) DO UPDATE SET "
                 "status = 'attended', evidence = excluded.evidence, confidence = excluded.confidence",
                 (user, event_id, evidence, confidence))
    add_provisional_review(conn, user, event_id)
    return prev is None or prev["status"] != "attended"


@router.post("/attendance", response_model=schemas.AttendanceSetResponse)
def attendance_set(body: schemas.AttendanceSetRequest, user: str, conn=Depends(get_db)):
    """Mark one show: interested ("want to go"), going, attended ("went"), or null to clear.
    Clearing an attended show also drops its provisional review; a real review stays."""
    if load_event(conn, body.event_id) is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if body.status is None:
        conn.execute("DELETE FROM attendance WHERE user_id = ? AND event_id = ?", (user, body.event_id))
        conn.execute("DELETE FROM reviews WHERE user_id = ? AND event_id = ? AND theta_var >= ?",
                     (user, body.event_id, PROVISIONAL_VAR))
    elif body.status == "attended":
        mark_attended(conn, user, body.event_id)
    else:
        conn.execute("INSERT INTO attendance (user_id, event_id, status, evidence, confidence) "
                     "VALUES (?, ?, ?, 'manual', 1.0) ON CONFLICT(user_id, event_id) DO UPDATE SET "
                     "status = excluded.status, evidence = 'manual', confidence = 1.0",
                     (user, body.event_id, body.status))
    conn.commit()
    return {"event_id": body.event_id, "status": body.status}


@router.get("/attendance/unranked", response_model=list[schemas.Event])
def attendance_unranked(user: str, conn=Depends(get_db)):
    """Shows the user went to but hasn't reviewed yet — the "Rank it now" prompt, most recent first."""
    rows = conn.execute(
        f"SELECT ev.* FROM ({EVENT_SQL}) ev JOIN attendance a ON a.event_id = ev.id "
        "LEFT JOIN reviews r ON r.user_id = a.user_id AND r.event_id = a.event_id "
        "WHERE a.user_id = ? AND a.status = 'attended' AND (r.event_id IS NULL OR r.theta_var >= ?) "
        "ORDER BY ev.start_at DESC, ev.id", (user, PROVISIONAL_VAR))
    return [event_from_row(r) for r in rows]
