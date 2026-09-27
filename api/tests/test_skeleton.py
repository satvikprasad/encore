"""Fixtures validate against schemas.py, and the skeleton serves real users."""
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from app import schemas as S

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"

FIXTURE_TYPES = {
    "users.json": list[S.User],
    "review_post.json": S.ReviewPostResponse,
    "compare_next.json": S.CompareNext,
    "compare_post.json": S.Ranking,
    "rank.json": S.Ranking,
    "events_upcoming.json": list[S.EventWithFriends],
    "event_detail.json": S.EventDetail,
    "matches_locked.json": S.ErrorResponse,
    "matches.json": list[S.MatchCandidate],
    "verify_start.json": S.VerifyStartResponse,
    "crew_create.json": S.Crew,
    "crew_message.json": S.Crew,
    "crew_plan.json": S.Crew,
    "crew_get.json": S.Crew,
    "events_recommended.json": list[S.RecommendedEvent],
    "events_search.json": list[S.EventWithFriends],
    "people.json": list[S.PersonCard],
    "user_profile.json": S.UserProfile,
    "follows.json": S.FollowResponse,
    "unranked.json": list[S.Event],
    "attendance_set.json": S.AttendanceSetResponse,
    "tickets.json": list[S.TicketOffer],
    "media.json": list[S.MediaFile],
    "media_feed.json": list[S.MediaFile],
    "media_upload.json": S.MediaFile,
    "event_create.json": S.Event,
    "artist_search.json": list[S.ArtistHit],
}


def test_every_fixture_is_typed():
    assert {p.name for p in FIXTURES.glob("*.json")} == set(FIXTURE_TYPES)


@pytest.mark.parametrize("name", sorted(FIXTURE_TYPES))
def test_fixture_validates(name):
    TypeAdapter(FIXTURE_TYPES[name]).validate_python(json.loads((FIXTURES / name).read_text()))


def test_users_from_real_db(client):
    r = client.get("/users")
    assert r.status_code == 200
    sam = next(u for u in r.json() if u["id"] == "sam")
    assert sam["name"] == "Artem Kim" and sam["verified"] is False


def test_cors_allows_web(client):
    r = client.options("/users", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
