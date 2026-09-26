"""Crews, messages and plans (AGENTS.md §9 M4 AI plan)."""
import json
import time
from pathlib import Path

import pytest

from app.ai import grok

TRANSCRIPT = json.loads((Path(__file__).resolve().parents[2] / "fixtures" / "crew_plan.json").read_text())["messages"]


@pytest.fixture
def crew(client, db):
    """Verified Sam's crew with Maya and Jordan on t01, holding the demo transcript."""
    db.execute("UPDATE users SET verified = 1 WHERE id = 'sam'")
    db.commit()
    crew = client.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["maya", "jordan"]}).json()
    for m in TRANSCRIPT:
        crew = client.post(f"/crews/{crew['id']}/messages?user={m['user_id']}", json={"text": m["text"]}).json()
    return crew


def test_create_and_message(crew, client):
    assert [m["id"] for m in crew["members"]] == ["sam", "maya", "jordan"]
    assert [m["text"] for m in crew["messages"]] == [m["text"] for m in TRANSCRIPT]
    assert client.get(f"/crews/{crew['id']}?user=sam").json() == crew


def test_non_member_cannot_post(crew, client):
    r = client.post(f"/crews/{crew['id']}/messages?user=priya", json={"text": "hi"})
    assert r.status_code == 403


def test_create_rejects_unknown_member(client, db):
    db.execute("UPDATE users SET verified = 1 WHERE id = 'sam'")
    db.commit()
    r = client.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["priya", "ghost"]})
    assert r.status_code == 404


def _assert_names_constraints(plan):
    prose = plan["compromise_note"] + " " + " ".join(p["note"] for p in plan["per_member"])
    assert "sensory" in prose and "Maya" in plan["compromise_note"]
    assert "$75" in prose and "Jordan" in plan["compromise_note"]
    assert plan["option"]["price"] <= 75
    assert {p["user_id"] for p in plan["per_member"]} == {"sam", "maya", "jordan"}


def test_plan_fallback_without_key(crew, client, monkeypatch):
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    out = client.post(f"/crews/{crew['id']}/plan?user=sam").json()
    _assert_names_constraints(out["plan"])
    assert out["plan"]["meet_at"] == "2026-10-24T18:30-04:00"
    assert client.get(f"/crews/{crew['id']}?user=maya").json()["plan"] == out["plan"]


def test_plan_fallback_on_timeout(crew, client, monkeypatch):
    monkeypatch.setenv("GROK_API_KEY", "test-key")
    monkeypatch.setattr(grok, "TIMEOUT_S", 0.2)
    monkeypatch.setattr(grok, "_post", lambda *a: time.sleep(1) or "{}")
    start = time.monotonic()
    out = client.post(f"/crews/{crew['id']}/plan?user=sam").json()
    assert time.monotonic() - start < 0.8
    _assert_names_constraints(out["plan"])


GOOD = {
    "option_index": 0,
    "meet_at": "2026-10-24T18:30:00-04:00",
    "meet_where": "Front steps of The Eastern",
    "per_member": [
        {"user_id": "sam", "note": "Clear view of the lights from the rail."},
        {"user_id": "maya", "note": "The quiet room covers your sensory needs."},
        {"user_id": "jordan", "note": "$45 keeps you under $75."},
    ],
    "compromise_note": "Jordan's $75 cap set the tier; Maya's sensory need is covered by the quiet room.",
    "summary": "Lumen Drift at The Eastern, $45 each, meet 6:30.",
}


def test_plan_uses_grok_when_valid(crew, client, monkeypatch):
    monkeypatch.setenv("GROK_API_KEY", "test-key")
    monkeypatch.setattr(grok, "_post", lambda *a: json.dumps(GOOD))
    plan = client.post(f"/crews/{crew['id']}/plan?user=sam").json()["plan"]
    assert plan["compromise_note"] == GOOD["compromise_note"]
    _assert_names_constraints(plan)


@pytest.mark.parametrize("patch", [
    {"compromise_note": "Everyone is happy."},  # names neither budget nor need
    {"option_index": 2},                         # over Jordan's budget
    {"option_index": 9},                         # no such option
])
def test_plan_invalid_grok_falls_back(crew, client, monkeypatch, patch):
    bad = dict(GOOD, **patch)
    if "compromise_note" in patch:
        bad["per_member"] = [dict(p, note="Sounds fun.") for p in GOOD["per_member"]]
    monkeypatch.setenv("GROK_API_KEY", "test-key")
    monkeypatch.setattr(grok, "_post", lambda *a: json.dumps(bad))
    plan = client.post(f"/crews/{crew['id']}/plan?user=sam").json()["plan"]
    assert plan["compromise_note"] != bad["compromise_note"]
    _assert_names_constraints(plan)


def test_fallback_flags_unmet_need():
    from app.ai.plan import fallback_plan
    event = {"id": "x", "artist": {"name": "A"}, "start_at": "2026-10-24T20:00:00-04:00", "doors_at": None,
             "venue": {"name": "Terminal West", "access_profile": {
                 "step_free": False, "ada_seating": False, "quiet_room": False,
                 "strobe_policy": "warned", "interpreter": "never"}}}
    lena = {"id": "lena", "name": "Lena Fischer", "budget_max": None, "accessibility_needs": ["mobility"]}
    plan = fallback_plan(event, [lena], {"event_id": "x", "tier_label": "GA", "price": 30,
                                         "per_member": [{"user_id": "lena", "score": 0.2}]})
    assert "lacks" in plan["compromise_note"] and "Heads up" in plan["per_member"][0]["note"]
