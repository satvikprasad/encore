"""Verification flow and the 403 gate (AGENTS.md §6, §9 M4 Verify)."""
import json

LOCKED = {"error": "verification_required"}


def _verify(client, user="sam"):
    start = client.post(f"/verify/start?user={user}").json()
    assert start["url"] == f"/verify/mock/{start['session_id']}"
    r = client.post("/verify/webhook", json={"session_id": start["session_id"], "status": "verified"})
    assert r.json() == {"ok": True}


def test_matches_locked_until_verified(client, db):
    r = client.get("/matches/t01?user=sam")
    assert r.status_code == 403 and r.json() == LOCKED
    _verify(client)
    assert db.execute("SELECT verified FROM users WHERE id='sam'").fetchone()[0] == 1
    assert client.get("/matches/t01?user=sam").status_code == 200


def test_verified_user_passes(client):
    assert client.get("/matches/t01?user=maya").status_code == 200


def test_crew_with_friends_only_is_open(client):
    r = client.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["priya", "dev"]})
    assert r.status_code == 200


def test_crew_with_stranger_is_gated(client):
    r = client.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["maya", "jordan"]})
    assert r.status_code == 403 and r.json() == LOCKED
    _verify(client)
    r = client.post("/crews?user=sam", json={"event_id": "t01", "member_ids": ["maya", "jordan"]})
    assert r.status_code == 200


def test_messages_gated_when_crew_has_stranger(client, db):
    db.execute("INSERT INTO crews (id, event_id, member_ids) VALUES ('c1', 't01', ?)",
               (json.dumps(["sam", "maya"]),))
    db.execute("INSERT INTO crews (id, event_id, member_ids) VALUES ('c2', 't01', ?)",
               (json.dumps(["sam", "priya"]),))
    db.commit()
    r = client.post("/crews/c1/messages?user=sam", json={"text": "hi"})
    assert r.status_code == 403 and r.json() == LOCKED
    assert client.post("/crews/c2/messages?user=sam", json={"text": "hi"}).status_code != 403


def test_403_carries_cors_headers(client):
    r = client.get("/matches/t01?user=sam", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 403
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_webhook_unknown_session(client):
    r = client.post("/verify/webhook", json={"session_id": "vs_nope", "status": "verified"})
    assert r.status_code == 404


def test_mock_page_posts_webhook_and_sanitizes_return_to(client):
    sid = client.post("/verify/start?user=sam").json()["session_id"]
    html = client.get(f"/verify/mock/{sid}?returnTo=http://localhost:3000/events/t01").text
    assert "/verify/webhook" in html and json.dumps(sid) in html
    assert '"http://localhost:3000/events/t01"' in html
    evil = client.get(f"/verify/mock/{sid}?returnTo=https://evil.example").text
    assert "evil.example" not in evil
