"""M4 — crews and plans. The verification gate for these routes lives in app/gate.py."""
import json
import secrets
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..ai import plan as ai_plan
from ..db import get_db, load_event, load_user, load_users

router = APIRouter(tags=["crews"])

NOT_FOUND = JSONResponse(status_code=404, content={"error": "not_found"})


def _load_crew(conn: sqlite3.Connection, crew_id: str):
    row = conn.execute("SELECT * FROM crews WHERE id = ?", (crew_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "event": load_event(conn, row["event_id"]),
        "members": load_users(conn, json.loads(row["member_ids"])),
        "messages": json.loads(row["messages"]),
        "plan": json.loads(row["plan"]) if row["plan"] else None,
    }


def _member_crew(conn: sqlite3.Connection, crew_id: str, user: str):
    """(crew, error_response) — the crew if `user` is in it."""
    crew = _load_crew(conn, crew_id)
    if crew is None:
        return None, NOT_FOUND
    if user not in {m["id"] for m in crew["members"]}:
        return None, JSONResponse(status_code=403, content={"error": "not_a_member"})
    return crew, None


@router.post("/crews", response_model=schemas.Crew)
def create_crew(body: schemas.CrewCreateRequest, user: str, conn=Depends(get_db)):
    member_ids = list(dict.fromkeys([user, *body.member_ids]))
    if load_event(conn, body.event_id) is None or len(load_users(conn, member_ids)) != len(member_ids):
        return NOT_FOUND
    crew_id = f"crew_{secrets.token_hex(4)}"
    conn.execute("INSERT INTO crews (id, event_id, member_ids) VALUES (?,?,?)",
                 (crew_id, body.event_id, json.dumps(member_ids)))
    conn.commit()
    return _load_crew(conn, crew_id)


@router.get("/crews/{crew_id}", response_model=schemas.Crew)
def get_crew(crew_id: str, user: str, conn=Depends(get_db)):
    crew, err = _member_crew(conn, crew_id, user)
    return err or crew


@router.post("/crews/{crew_id}/messages", response_model=schemas.Crew)
def post_message(crew_id: str, body: schemas.CrewMessageRequest, user: str, conn=Depends(get_db)):
    crew, err = _member_crew(conn, crew_id, user)
    if err:
        return err
    text = body.text.strip()
    if text:
        crew["messages"].append({"user_id": user, "text": text,
                                 "at": datetime.now().astimezone().isoformat(timespec="seconds")})
        conn.execute("UPDATE crews SET messages = ? WHERE id = ?", (json.dumps(crew["messages"]), crew_id))
        conn.commit()
    return crew


@router.post("/crews/{crew_id}/plan", response_model=schemas.Crew)
def make_plan(crew_id: str, user: str, conn=Depends(get_db)):
    crew, err = _member_crew(conn, crew_id, user)
    if err:
        return err
    crew["plan"] = ai_plan.make_plan(crew["event"], crew["members"], crew["messages"])
    conn.execute("UPDATE crews SET plan = ? WHERE id = ?", (json.dumps(crew["plan"]), crew_id))
    conn.commit()
    return crew
