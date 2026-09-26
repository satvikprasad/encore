"""M2 — pairwise comparisons."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..db import get_db
from ..ml import ranker
from .rank import load_state, pair_response, ranking_response, save_state

router = APIRouter(tags=["compare"])


@router.get("/compare/next", response_model=Optional[schemas.CompareNext])
def compare_next(user: str, conn=Depends(get_db)):
    pair = ranker.next_pair(load_state(conn, user))
    return pair_response(conn, pair) if pair else None


@router.post("/compare", response_model=schemas.Ranking)
def post_compare(body: schemas.CompareRequest, user: str, conn=Depends(get_db)):
    state = load_state(conn, user)
    if body.event_a not in state.shows or body.event_b not in state.shows or body.event_a == body.event_b:
        return JSONResponse(status_code=400, content={"error": "both_events_must_be_reviewed"})
    if body.winner not in (body.event_a, body.event_b):
        return JSONResponse(status_code=400, content={"error": "winner_not_in_pair"})
    ranker.apply(state, body.event_a, body.event_b, body.winner)
    conn.execute("INSERT INTO comparisons (user_id, event_a, event_b, winner, created_at) VALUES (?,?,?,?,?)",
                 (user, body.event_a, body.event_b, body.winner,
                  datetime.now(timezone.utc).isoformat(timespec="seconds")))
    save_state(conn, user, state)
    conn.commit()
    return ranking_response(conn, user, state)
