"""M1 — events. Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[schemas.EventWithFriends])
def list_events(user: str, upcoming: bool = True):
    return fixture("events_upcoming.json")


@router.get("/events/{event_id}", response_model=schemas.EventDetail)
def event_detail(event_id: str, user: str):
    return fixture("event_detail.json")
