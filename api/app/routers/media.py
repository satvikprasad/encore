"""M2 — photo matching and attendance confirmation. Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["media"])


@router.post("/media/match", response_model=list[schemas.MediaMatch])
def media_match(body: schemas.MediaMatchRequest, user: str):
    return fixture("media_match.json")


@router.post("/attendance/confirm", response_model=schemas.AttendanceConfirmResponse)
def attendance_confirm(body: schemas.AttendanceConfirmRequest, user: str):
    return fixture("attendance_confirm.json")
