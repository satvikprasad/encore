"""M2 — photo matching and attendance confirmation."""
import hashlib

from fastapi import APIRouter, Depends

from .. import schemas
from ..db import get_db, load_event
from ..ml import matcher

router = APIRouter(tags=["media"])


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
             "photo_count": m["photo_count"], "suggested": m["suggested"]} for m in matches]


@router.post("/attendance/confirm", response_model=schemas.AttendanceConfirmResponse)
def attendance_confirm(body: schemas.AttendanceConfirmRequest, user: str, conn=Depends(get_db)):
    confidences = body.confidences or [1.0] * len(body.event_ids)
    added = 0
    for event_id, conf in zip(body.event_ids, confidences):
        if load_event(conn, event_id) is None:
            continue
        prev = conn.execute("SELECT status FROM attendance WHERE user_id = ? AND event_id = ?",
                            (user, event_id)).fetchone()
        conn.execute("INSERT INTO attendance (user_id, event_id, status, evidence, confidence) "
                     "VALUES (?, ?, 'attended', ?, ?) ON CONFLICT(user_id, event_id) DO UPDATE SET "
                     "status = 'attended', evidence = excluded.evidence, confidence = excluded.confidence",
                     (user, event_id, body.evidence, conf))
        added += prev is None or prev["status"] != "attended"
    conn.commit()
    return {"added": added}
