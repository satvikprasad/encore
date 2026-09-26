"""Discovery endpoints (search, For-you recommendations, manual marks, people, profiles, follows)
against a copy of the seeded data/encore.db."""
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.test_matcher import DECOYS, PHOTOS

SEEDED = Path(__file__).resolve().parents[2] / "data" / "encore.db"
pytestmark = pytest.mark.skipif(not SEEDED.exists(), reason="run `make seed` first")


@pytest.fixture
def api(tmp_path, monkeypatch):
    db = tmp_path / "encore.db"
    shutil.copy(SEEDED, db)
    monkeypatch.setenv("ENCORE_DB", str(db))
    from app.main import app
    return TestClient(app)


def test_search_spans_past_and_upcoming(api):
    hits = api.get("/events?user=sam&q=night").json()
    assert hits and all("night" in (e["artist"]["name"] + e["venue"]["name"]).lower() for e in hits)
    hits = api.get("/events?user=sam&q=eastern&limit=100").json()
    assert {e["is_past"] for e in hits} == {False, True}
    # upcoming first (soonest first), then past (most recent first)
    up = [e["start_at"] for e in hits if not e["is_past"]]
    past = [e["start_at"] for e in hits if e["is_past"]]
    assert [e["is_past"] for e in hits] == [False] * len(up) + [True] * len(past)
    assert up == sorted(up) and past == sorted(past, reverse=True)
    assert api.get("/events?user=sam&q=zzzz").json() == []
    assert len(api.get("/events?user=sam&q=e&limit=7").json()) == 7


def test_recommended_for_sam(api):
    recs = api.get("/events/recommended?user=sam").json()
    assert len(recs) == 5 and not any(e["is_past"] for e in recs)
    assert [e["score"] for e in recs] == sorted((e["score"] for e in recs), reverse=True)
    assert all(e["reason"] for e in recs)
    # t01: Priya (a friend) plus Maya and Jordan (verified 92%/80% fans) are going.
    t01 = next(e for e in recs if e["id"] == "t01")
    assert [f["id"] for f in t01["friends_interested"]] == ["priya"]
    assert "going" in t01["reason"]
    assert len(api.get("/events/recommended?user=sam&limit=2").json()) == 2


def test_manual_marks_and_unranked_prompt(api):
    assert api.get("/attendance/unranked?user=sam").json() == []

    # Want to go / going on an upcoming show: it leaves the recommendations, shows on the profile.
    assert api.post("/attendance?user=sam", json={"event_id": "t01", "status": "interested"}).json() == {
        "event_id": "t01", "status": "interested"}
    assert api.get("/events/t01?user=sam").json()["attendance"] == "interested"
    assert "t01" not in [e["id"] for e in api.get("/events/recommended?user=sam").json()]
    api.post("/attendance?user=sam", json={"event_id": "t01", "status": "going"})
    assert [(u["event"]["id"], u["status"]) for u in api.get("/users/sam?user=sam").json()["upcoming"]] == [
        ("t01", "going")]

    # "I went" on a past show → provisional review → it is in the Rank-it prompt until reviewed.
    api.post("/attendance?user=sam", json={"event_id": "d01", "status": "attended"})
    assert [e["id"] for e in api.get("/attendance/unranked?user=sam").json()] == ["d01"]
    api.post("/reviews?user=sam", json={"event_id": "d01", "scores": [5, 3, 4, 3, 3, 4, 5], "tags": [], "price_paid": None})
    assert api.get("/attendance/unranked?user=sam").json() == []

    # Clearing an attended show drops only a provisional review.
    api.post("/attendance?user=sam", json={"event_id": "d02", "status": "attended"})
    api.post("/attendance?user=sam", json={"event_id": "d02", "status": None})
    assert api.get("/events/d02?user=sam").json()["attendance"] is None
    assert "d02" not in [s["event"]["id"] for s in api.get("/rank?user=sam").json()["shows"]]
    assert api.post("/attendance?user=sam", json={"event_id": "nope", "status": "going"}).status_code == 404


def test_photo_import_feeds_the_prompt(api):
    items = [{"lat": a, "lng": b, "captured_at": t} for a, b, t in PHOTOS + DECOYS]
    found = api.post("/media/match?user=sam", json={"items": items}).json()
    api.post("/attendance/confirm?user=sam", json={"event_ids": [m["event"]["id"] for m in found], "evidence": "photo",
                                                  "confidences": [m["confidence"] for m in found]})
    unranked = [e["id"] for e in api.get("/attendance/unranked?user=sam").json()]
    assert sorted(unranked) == ["d01", "d02", "d03", "d04", "d05", "d06"]
    assert unranked[0] == "d04"  # surest match first: the show the demo reviews


def test_people_profiles_and_follows(api):
    people = api.get("/people?user=sam").json()
    assert len(people) == 32 and "sam" not in [p["user"]["id"] for p in people]
    assert [p["match_pct"] for p in people] == sorted((p["match_pct"] for p in people), reverse=True)
    by_id = {p["user"]["id"]: p for p in people}
    assert by_id["priya"]["following"] and not by_id["maya"]["following"]
    assert by_id["maya"]["match_pct"] == 92 and by_id["maya"]["shows_count"] == 10
    assert [p["user"]["id"] for p in api.get("/people?user=sam&q=MAY").json()] == ["maya"]

    maya = api.get("/users/maya?user=sam").json()
    assert maya["match_pct"] == 92 and maya["following"] is False and maya["followers"] == 1
    assert [s["rank"] for s in maya["shows"]] == list(range(1, len(maya["shows"]) + 1))
    assert [(u["event"]["id"], u["status"]) for u in maya["upcoming"]] == [("t01", "interested")]
    assert api.get("/users/sam?user=sam").json()["match_pct"] is None
    assert api.get("/users/nope?user=sam").status_code == 404

    assert api.post("/follows?user=sam", json={"user_id": "maya", "follow": True}).json() == {
        "following": ["dev", "lena", "maya", "priya"]}
    assert api.get("/users/maya?user=sam").json()["following"] is True
    assert api.post("/follows?user=sam", json={"user_id": "maya", "follow": False}).json()["following"] == [
        "dev", "lena", "priya"]
    assert api.post("/follows?user=sam", json={"user_id": "sam", "follow": True}).status_code == 400
