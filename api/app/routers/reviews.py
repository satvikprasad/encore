"""M2 — reviews. Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["reviews"])


@router.post("/reviews", response_model=schemas.ReviewPostResponse)
def post_review(body: schemas.ReviewIn, user: str):
    return fixture("review_post.json")
