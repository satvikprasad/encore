"""Grok client fallbacks and match explanations (AGENTS.md §9 M4 AI explain)."""
import json
import time

import pytest

from app.ai import explain, grok

SHARED = ["d02", "d04", "d07", "d09"]
ARTISTS = {"Velvet Static", "Aurora Fields", "Neon Cathedral", "Solar Choir"}


@pytest.fixture(autouse=True)
def clear_cache():
    from app.routers import matches
    matches._cache.clear()


@pytest.fixture
def reviewed(db):
    """Sam and Maya reviewed their four shared shows; Sam is verified."""
    theta = {"d02": [4, 3, 4, 4, 4, 4, 5], "d04": [4, 3, 3, 4, 5, 4, 5],
             "d07": [4, 2, 2, 3, 5, 4, 5], "d09": [4, 2, 2, 4, 5, 3, 5]}
    tags = {"d04": ["LED wall", "lasers"], "d09": ["pyro"]}
    for uid in ("sam", "maya"):
        for eid, th in theta.items():
            db.execute("INSERT INTO reviews (user_id, event_id, would_again, tags, theta) VALUES (?,?,?,?,?)",
                       (uid, eid, 1, json.dumps(tags.get(eid, [])), json.dumps(th)))
            db.execute("INSERT INTO attendance (user_id, event_id, status) VALUES (?, ?, 'attended')", (uid, eid))
    db.execute("UPDATE users SET verified = 1 WHERE id = 'sam'")
    db.commit()
    return db


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("GROK_API_KEY", "test-key")


def _maya(client):
    return next(c for c in client.get("/matches/t01?user=sam").json() if c["user"]["id"] == "maya")


def test_no_key_uses_template(client, reviewed, monkeypatch):
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    maya = _maya(client)
    assert maya["explanation"] == "You both rated Aurora Fields highly and care most about production."
    assert maya["icebreaker"] == "Ask them what they thought of the LED wall at State Farm Arena."


def test_fallback_on_timeout(reviewed, with_key, monkeypatch):
    monkeypatch.setattr(grok, "TIMEOUT_S", 0.2)
    monkeypatch.setattr(grok, "_post", lambda *a: time.sleep(1) or '{"explanation":"x","icebreaker":"y"}')
    start = time.monotonic()
    out = grok.chat([], fallback="fb")
    assert out == "fb" and time.monotonic() - start < 0.5


def test_fallback_on_http_error(with_key, monkeypatch):
    def boom(*a):
        raise grok.httpx.ConnectError("down")
    monkeypatch.setattr(grok, "_post", boom)
    assert grok.chat([], fallback="fb") == "fb"


def test_grok_answer_used_when_valid(client, reviewed, with_key, monkeypatch):
    answer = {"explanation": "You and Maya both loved the Aurora Fields production. You forgave the room at Solar Choir.",
              "icebreaker": "Was the LED wall at Aurora Fields the best you've seen?"}
    monkeypatch.setattr(grok, "_post", lambda *a: "```json\n" + json.dumps(answer) + "\n```")
    maya = _maya(client)
    assert maya["explanation"] == answer["explanation"]
    assert any(a in maya["explanation"] for a in ARTISTS)


@pytest.mark.parametrize("bad", [
    {"explanation": "One. Two. Three.", "icebreaker": "Aurora Fields?"},       # > 2 sentences
    {"explanation": "You both like music.", "icebreaker": "Seen any shows?"},   # cites no shared artist
    {"explanation": "Aurora Fields rules."},                                    # missing icebreaker
])
def test_invalid_grok_answer_falls_back(reviewed, with_key, monkeypatch, bad):
    monkeypatch.setattr(grok, "_post", lambda *a: json.dumps(bad))
    shows = explain.shared_shows(reviewed, "sam", "maya", SHARED)
    cand = {"user": {"id": "maya", "name": "Maya Chen", "weights": [1 / 7] * 7}, "match_pct": 84}
    viewer = {"name": "Sam Okafor", "weights": [1 / 7] * 7}
    text, _ = explain.explain(cand, shows, viewer)
    assert text.startswith("You both rated ")


def test_prompt_only_contains_shared_shows(reviewed, with_key, monkeypatch):
    seen = {}
    monkeypatch.setattr(grok, "_post", lambda messages, json_mode: seen.setdefault("m", messages) and "{}")
    shows = explain.shared_shows(reviewed, "sam", "maya", SHARED)
    cand = {"user": {"id": "maya", "name": "Maya Chen", "weights": [1 / 7] * 7}, "match_pct": 84}
    explain.explain(cand, shows, {"name": "Sam Okafor", "weights": [1 / 7] * 7})
    payload = json.loads(seen["m"][1]["content"])
    assert {s["artist"] for s in payload["shared_shows"]} == ARTISTS
    assert "Cite only" in seen["m"][0]["content"]
