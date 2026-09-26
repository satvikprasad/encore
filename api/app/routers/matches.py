"""M2 (scoring: ml.taste.candidates) + M4 (explanation). The verification gate for
this route lives in app/gate.py."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import schemas
from ..ai import explain
from ..db import connect, db_path, load_event, load_user
from ..fixtures import fixture
from ..ml.taste import candidates

router = APIRouter(tags=["matches"])

_cache: dict[tuple, tuple[str, str]] = {}


@router.get("/matches/{event_id}", response_model=list[schemas.MatchCandidate])
def get_matches(event_id: str, user: str):
    if not db_path().exists():  # before M1's first seed
        return fixture("matches.json")
    with closing(connect()) as conn:
        viewer = load_user(conn, user)
        event = load_event(conn, event_id)
        if viewer is None or event is None:
            return JSONResponse(status_code=404, content={"error": "not_found"})
        cands = candidates(user, event_id, conn)
        jobs = []
        for c in cands:
            key = (user, c["user"]["id"], event_id, tuple(c["shared_event_ids"]))
            shows = explain.shared_shows(conn, user, c["user"]["id"], c["shared_event_ids"])
            jobs.append((c, key, shows))

    def fill(job):
        c, key, shows = job
        if key not in _cache:
            _cache[key] = explain.explain(c, shows, viewer, event)
        c["explanation"], c["icebreaker"] = _cache[key]
        return c

    with ThreadPoolExecutor(max_workers=5) as pool:
        return list(pool.map(fill, jobs))
