"""M2 (scoring) + M4 (explanation, gate). Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["matches"])


@router.get("/matches/{event_id}", response_model=list[schemas.MatchCandidate])
def get_matches(event_id: str, user: str):
    return fixture("matches.json")
