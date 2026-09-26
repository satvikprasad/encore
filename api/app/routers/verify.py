"""M4 — identity verification (mocked). Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["verify"])


@router.post("/verify/start", response_model=schemas.VerifyStartResponse)
def verify_start(user: str):
    return fixture("verify_start.json")


@router.post("/verify/webhook", response_model=schemas.OkResponse)
def verify_webhook(body: schemas.VerifyWebhook):
    return {"ok": True}
