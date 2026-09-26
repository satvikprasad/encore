"""M2 — reviews."""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..constants import RANKER
from ..db import get_db, load_event
from ..ml import ranker
from .rank import load_state

router = APIRouter(tags=["reviews"])


@router.post("/reviews", response_model=schemas.ReviewPostResponse)
def post_review(body: schemas.ReviewIn, user: str, conn=Depends(get_db)):
    if load_event(conn, body.event_id) is None:
        return JSONResponse(status_code=404, content={"error": "unknown_event"})
    scores = [int(round(x)) for x in body.scores]
    would_again = scores[6] >= 3
    theta = [float(x) for x in ranker.init_theta([*scores[:6], 5 if would_again else 1])]
    # Re-reviewing moves the show to the end of the rowid order so it is compared first.
    conn.execute("DELETE FROM reviews WHERE user_id = ? AND event_id = ?", (user, body.event_id))
    conn.execute(
        "INSERT INTO reviews (user_id, event_id, music, crowd, venue, accessibility, production, value,"
        " would_again, tags, price_paid, theta, theta_var) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (user, body.event_id, *scores[:6], int(would_again), json.dumps(body.tags), body.price_paid,
         json.dumps(theta), RANKER["prior_var"]))
    conn.execute("INSERT INTO attendance (user_id, event_id, status) VALUES (?, ?, 'attended') "
                 "ON CONFLICT(user_id, event_id) DO UPDATE SET status = 'attended'", (user, body.event_id))
    conn.commit()
    pair = ranker.next_pair(load_state(conn, user))
    next_compare = {"event_a": load_event(conn, pair[0]), "event_b": load_event(conn, pair[1])} if pair else None
    return {"ok": True, "next_compare": next_compare}
