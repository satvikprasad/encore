"""M2 — ranking. Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["rank"])


@router.get("/rank", response_model=schemas.Ranking)
def get_rank(user: str):
    return fixture("rank.json")
