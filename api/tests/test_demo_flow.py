"""The §10 demo run-through against a copy of the seeded data/encore.db."""
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SEEDED = Path(__file__).resolve().parents[2] / "data" / "encore.db"
PRODUCTION = 4
pytestmark = pytest.mark.skipif(not SEEDED.exists(), reason="run `make seed` first")


@pytest.fixture
def api(tmp_path, monkeypatch):
    db = tmp_path / "encore.db"
    shutil.copy(SEEDED, db)
    monkeypatch.setenv("ENCORE_DB", str(db))
    from app.main import app
    from app.routers import matches
    matches._cache.clear()
    return TestClient(app)




def test_run_through(api):
    users = api.get("/users").json()
    sam = next(u for u in users if u["id"] == "sam")
    assert sam["verified"] is False

    # 2. Log a show: search each of the six shows and mark "I went" → they wait in the Rank-it prompt.
    for eid in ("d01", "d02", "d03", "d04", "d05", "d06"):
        assert api.post("/attendance?user=sam", json={"event_id": eid, "status": "attended"}).json()["status"] == "attended"
    assert {e["id"] for e in api.get("/attendance/unranked?user=sam").json()} == {"d01", "d02", "d03", "d04", "d05", "d06"}

    # 3. Review d04 → 3 compares → ranking; weights move toward production.
    r = api.post("/reviews?user=sam", json={"event_id": "d04", "scores": [4, 3, 3, 4, 4, 3, 5],
                                             "tags": ["LED wall"], "price_paid": 95}).json()
    assert r["next_compare"]["event_a"]["id"] == "d04"
    # Every question compares the show just rated (event_a) with another one, Beli-style. Sam is a
    # production lover: the show with the stronger production rating wins each time.
    theta = {s["event"]["id"]: s["theta"] for s in api.get("/rank?user=sam").json()["shows"]}
    seen = set()
    for _ in range(3):
        q = api.get("/compare/next?user=sam&focus=d04").json()
        assert q["event_a"]["id"] == "d04"
        assert q["question"] == (f"Better or worse than {q['event_b']['artist']['name']} "
                                 f"at {q['event_b']['venue']['name']}?")
        pair = frozenset((q["event_a"]["id"], q["event_b"]["id"]))
        assert pair not in seen
        seen.add(pair)
        a, b = q["event_a"]["id"], q["event_b"]["id"]
        winner = max((a, b), key=lambda e: theta[e][PRODUCTION] - sum(theta[e][:6]) / 6)
        ranking = api.post("/compare?user=sam", json={"event_a": a, "event_b": b, "winner": winner}).json()
    assert ranking["comparisons_done"] == 3 and len(ranking["shows"]) >= 12
    assert max(range(7), key=lambda i: ranking["weights"][i]) == PRODUCTION
    assert [s["tier"] for s in ranking["shows"]].count("S") == 1

    # 4. Event page: locked → verify → Maya and Jordan with explanations.
    detail = api.get("/events/t01?user=sam").json()
    assert detail["event"]["venue"]["id"] in ("eastern", "tabernacle")
    assert api.get("/matches/t01?user=sam").status_code == 403
    sid = api.post("/verify/start?user=sam").json()["session_id"]
    api.post("/verify/webhook", json={"session_id": sid, "status": "verified"})
    matches = api.get("/matches/t01?user=sam").json()
    # Maya (production lover, 4 shared shows) outranks Jordan (music first, 3 shared); the exact percentages
    # depend on the three answers, which the demo user gives live.
    assert [m["user"]["id"] for m in matches] == ["maya", "jordan"]
    assert matches[0]["match_pct"] > matches[1]["match_pct"] >= 50
    assert all(m["explanation"] and m["icebreaker"] for m in matches)
    assert all(m["user"]["verified"] for m in matches)

    # 5. Crew → 3 messages → plan within Jordan's budget, at a venue with a quiet room for Maya.
    crew = api.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["maya", "jordan"]}).json()
    for uid, text in [("sam", "Seats where we can see the lights?"), ("jordan", "I can't do more than $75."),
                      ("maya", "Somewhere less loud please.")]:
        crew = api.post(f"/crews/{crew['id']}/messages?user={uid}", json={"text": text}).json()
    plan = api.post(f"/crews/{crew['id']}/plan?user=sam").json()["plan"]
    assert plan["option"]["price"] <= 75
    assert "sensory" in plan["compromise_note"] and "$75" in plan["compromise_note"]


def test_group_options_for_demo_crew(api):
    from app.ml.group import score_options
    options = score_options(["sam", "maya", "jordan"], "t01")
    # Three price tiers when the show has a published price range; a single GA option until a
    # ticket-site key fills prices in (scraped shows carry none).
    assert 1 <= len(options) <= 3 and options[0]["feasible"] and options[0]["price"] <= 75
    assert all(len(o["per_member"]) == 3 for o in options)


def test_events_endpoints(api):
    upcoming = api.get("/events?upcoming=true&user=sam").json()
    assert len(upcoming) >= 120 and not any(e["is_past"] for e in upcoming)
    assert any(e["friends_interested"] for e in upcoming)
    past = api.get("/events?upcoming=false&user=sam").json()
    assert len(past) >= 250
    assert api.get("/events/nope?user=sam").status_code == 404
