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

try:
    from ..ml.taste import candidates as _taste_candidates
except ImportError:  # M2 hasn't shipped taste.py yet
    _taste_candidates = None

router = APIRouter(tags=["matches"])

_cache: dict[tuple, tuple[str, str]] = {}


def _candidates(user: str, event_id: str) -> list[dict]:
    if _taste_candidates is None:
        return [dict(c, explanation=None, icebreaker=None) for c in fixture("matches.json")]
    return [c.model_dump() if hasattr(c, "model_dump") else dict(c) for c in _taste_candidates(user, event_id)]


@router.get("/matches/{event_id}", response_model=list[schemas.MatchCandidate])
def get_matches(event_id: str, user: str):
    if not db_path().exists():  # before M1's first seed
        return fixture("matches.json")
    with closing(connect()) as conn:
        viewer = load_user(conn, user)
        event = load_event(conn, event_id)
        if viewer is None or event is None:
            return JSONResponse(status_code=404, content={"error": "not_found"})
        cands = _candidates(user, event_id)
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
