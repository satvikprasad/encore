"""M2 — pairwise comparisons. Stub: returns fixtures."""
from typing import Optional

from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["compare"])


@router.get("/compare/next", response_model=Optional[schemas.CompareNext])
def compare_next(user: str):
    return fixture("compare_next.json")


@router.post("/compare", response_model=schemas.Ranking)
def post_compare(body: schemas.CompareRequest, user: str):
    return fixture("compare_post.json")
