"""M4 — crews and plans. Stub: returns fixtures."""
from fastapi import APIRouter

from .. import schemas
from ..fixtures import fixture

router = APIRouter(tags=["crews"])


@router.post("/crews", response_model=schemas.Crew)
def create_crew(body: schemas.CrewCreateRequest, user: str):
    return fixture("crew_create.json")


@router.post("/crews/{crew_id}/messages", response_model=schemas.Crew)
def post_message(crew_id: str, body: schemas.CrewMessageRequest, user: str):
    return fixture("crew_message.json")


@router.post("/crews/{crew_id}/plan", response_model=schemas.Crew)
def make_plan(crew_id: str, user: str):
    return fixture("crew_plan.json")
