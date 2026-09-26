"""M2 — photo matching and attendance (confirm from photos, mark by hand, unranked prompt)."""
import hashlib

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..constants import RANKER
from ..db import EVENT_SQL, event_from_row, get_db, load_event
from ..ml import matcher
from .reviews import add_provisional_review

router = APIRouter(tags=["media"])

# add_provisional_review stores a guessed review at double the prior variance; a real review resets it.
PROVISIONAL_VAR = 2 * RANKER["prior_var"]


@router.post("/media/match", response_model=list[schemas.MediaMatch])
def media_match(body: schemas.MediaMatchRequest, user: str, conn=Depends(get_db)):
    items = [i.model_dump() for i in body.items]
    venues = [dict(r) for r in conn.execute("SELECT id, lat, lng, geofence_radius_m, multi_room FROM venues")]
    events = [dict(r) for r in conn.execute("SELECT id, venue_id, start_at, doors_at FROM events WHERE is_past = 1")]
    matches = matcher.match(items, venues, events)

    matched = {n: (m["event_id"], m["confidence"]) for m in matches for n in m["item_indices"]}
    for n, item in enumerate(items):
        key = f"{user}|{item['lat']}|{item['lng']}|{item['captured_at']}"
        event_id, conf = matched.get(n, (None, None))
        conn.execute("INSERT OR REPLACE INTO media_items (id, user_id, captured_at, lat, lng, matched_event_id,"
                     " confidence) VALUES (?,?,?,?,?,?,?)",
                     ("m_" + hashlib.sha1(key.encode()).hexdigest()[:12], user, item["captured_at"],
                      item["lat"], item["lng"], event_id, conf))
    conn.commit()
    return [{"cluster_id": m["cluster_id"], "event": load_event(conn, m["event_id"]), "confidence": m["confidence"],
             "photo_count": m["photo_count"], "suggested": m["suggested"], "item_indices": sorted(m["item_indices"])}
            for m in matches]


def mark_attended(conn, user: str, event_id: str, evidence: str, confidence: float) -> bool:
    """Upsert an 'attended' row and give the show a provisional review. True if newly attended."""
    prev = conn.execute("SELECT status FROM attendance WHERE user_id = ? AND event_id = ?",
                        (user, event_id)).fetchone()
    conn.execute("INSERT INTO attendance (user_id, event_id, status, evidence, confidence) "
                 "VALUES (?, ?, 'attended', ?, ?) ON CONFLICT(user_id, event_id) DO UPDATE SET "
                 "status = 'attended', evidence = excluded.evidence, confidence = excluded.confidence",
                 (user, event_id, evidence, confidence))
    add_provisional_review(conn, user, event_id)
    return prev is None or prev["status"] != "attended"


@router.post("/attendance/confirm", response_model=schemas.AttendanceConfirmResponse)
def attendance_confirm(body: schemas.AttendanceConfirmRequest, user: str, conn=Depends(get_db)):
    confidences = body.confidences or [1.0] * len(body.event_ids)
    added = 0
    for event_id, conf in zip(body.event_ids, confidences):
        if load_event(conn, event_id) is None:
            continue
        added += mark_attended(conn, user, event_id, body.evidence, conf)
    conn.commit()
    return {"added": added}


@router.post("/attendance", response_model=schemas.AttendanceSetResponse)
def attendance_set(body: schemas.AttendanceSetRequest, user: str, conn=Depends(get_db)):
    """Mark one show by hand: interested ("want to go"), going, attended ("went"), or null to clear.
    Clearing an attended show also drops its provisional review; a real review stays."""
    if load_event(conn, body.event_id) is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if body.status is None:
        conn.execute("DELETE FROM attendance WHERE user_id = ? AND event_id = ?", (user, body.event_id))
        conn.execute("DELETE FROM reviews WHERE user_id = ? AND event_id = ? AND theta_var >= ?",
                     (user, body.event_id, PROVISIONAL_VAR))
    elif body.status == "attended":
        mark_attended(conn, user, body.event_id, "manual", 1.0)
    else:
        conn.execute("INSERT INTO attendance (user_id, event_id, status, evidence, confidence) "
                     "VALUES (?, ?, ?, 'manual', 1.0) ON CONFLICT(user_id, event_id) DO UPDATE SET "
                     "status = excluded.status, evidence = 'manual', confidence = 1.0",
                     (user, body.event_id, body.status))
    conn.commit()
    return {"event_id": body.event_id, "status": body.status}


@router.get("/attendance/unranked", response_model=list[schemas.Event])
def attendance_unranked(user: str, conn=Depends(get_db)):
    """Shows the user went to (photo import or by hand) but hasn't reviewed yet — the "Rank it now"
    prompt. Surest photo matches first, then most recent."""
    rows = conn.execute(
        f"SELECT ev.* FROM ({EVENT_SQL}) ev JOIN attendance a ON a.event_id = ev.id "
        "LEFT JOIN reviews r ON r.user_id = a.user_id AND r.event_id = a.event_id "
        "WHERE a.user_id = ? AND a.status = 'attended' AND (r.event_id IS NULL OR r.theta_var >= ?) "
        "ORDER BY a.confidence DESC, ev.start_at DESC", (user, PROVISIONAL_VAR))
    return [event_from_row(r) for r in rows]
