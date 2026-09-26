"""M2 — ranking. Also the DB <-> ranker state helpers used by reviews and compare."""
import json
import sqlite3

import numpy as np
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..db import get_db, load_event
from ..ml import ranker

router = APIRouter(tags=["rank"])


def load_state(conn: sqlite3.Connection, user: str) -> ranker.UserState:
    reviews = conn.execute("SELECT event_id, theta, theta_var FROM reviews WHERE user_id = ? ORDER BY rowid",
                           (user,)).fetchall()
    shows = [r["event_id"] for r in reviews]
    comparisons = []
    for c in conn.execute("SELECT event_a, event_b, winner FROM comparisons WHERE user_id = ? ORDER BY id", (user,)):
        loser = c["event_b"] if c["winner"] == c["event_a"] else c["event_a"]
        comparisons.append((c["winner"], loser))
    compared = {e for c in comparisons for e in c}
    # The most recently reviewed show goes first until it has been compared.
    new_show = shows[-1] if shows and shows[-1] not in compared else None
    return ranker.UserState(
        shows=shows,
        theta=np.array([json.loads(r["theta"]) for r in reviews], dtype=float).reshape(len(shows), 7),
        var=np.array([r["theta_var"] for r in reviews], dtype=float),
        comparisons=comparisons,
        new_show=new_show,
    )


def save_state(conn: sqlite3.Connection, user: str, state: ranker.UserState) -> None:
    conn.executemany("UPDATE reviews SET theta_var = ? WHERE user_id = ? AND event_id = ?",
                     [(float(v), user, e) for e, v in zip(state.shows, state.var)])
    w = [round(float(x), 4) for x in ranker.weights(state)]
    conn.execute("UPDATE users SET weights = ? WHERE id = ?", (json.dumps(w), user))


def ranking_response(conn: sqlite3.Connection, user: str, state: ranker.UserState) -> dict:
    w, shows = ranker.ranking(state)
    return {
        "user_id": user,
        "weights": [round(float(x), 4) for x in w],
        "shows": [{"event": load_event(conn, s.pop("event_id")), **s} for s in shows],
        "comparisons_done": len(state.comparisons),
    }


def pair_response(conn: sqlite3.Connection, pair) -> dict:
    a, b = load_event(conn, pair[0]), load_event(conn, pair[1])
    return {"event_a": a, "event_b": b,
            "question": f"Better or worse than {b['artist']['name']} at {b['venue']['name']}?"}


@router.get("/rank", response_model=schemas.Ranking)
def get_rank(user: str, conn=Depends(get_db)):
    if conn.execute("SELECT 1 FROM users WHERE id = ?", (user,)).fetchone() is None:
        return JSONResponse(status_code=404, content={"error": "unknown_user"})
    return ranking_response(conn, user, load_state(conn, user))
