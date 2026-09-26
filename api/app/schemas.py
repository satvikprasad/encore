"""Pydantic models — THE CONTRACT. Mirrors web/src/types.ts and AGENTS.md §5.

Changing anything here requires updating web/src/types.ts, the affected
fixture in fixtures/, and telling the team.
"""
from typing import Literal, Optional

from pydantic import BaseModel

Vec7 = tuple[float, float, float, float, float, float, float]
Need = Literal["mobility", "sensory", "hearing", "vision", "chronic", "neurodivergent"]
Tier = Literal["S", "A", "B", "C"]


# ---- core entities --------------------------------------------------------

class User(BaseModel):
    id: str
    name: str
    avatar: str
    budget_max: Optional[float]
    accessibility_needs: list[Need]
    verified: bool
    weights: Vec7


class Artist(BaseModel):
    id: str
    name: str
    genres: list[str]


class AccessProfile(BaseModel):
    step_free: bool
    ada_seating: bool
    quiet_room: bool
    strobe_policy: Literal["none", "warned", "unrestricted"]
    interpreter: Literal["on_request", "never"]


class Venue(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    multi_room: bool
    access_profile: AccessProfile


class Event(BaseModel):
    id: str
    artist: Artist
    venue: Venue
    start_at: str
    doors_at: Optional[str]
    price_min: Optional[float]
    price_max: Optional[float]
    tm_url: Optional[str]
    is_past: bool


class Review(BaseModel):
    user_id: str
    event_id: str
    scores: Vec7  # scores[6] = would_again ? 5 : 1
    tags: list[str]
    price_paid: Optional[float]


class RankedShow(BaseModel):
    event: Event
    theta: Vec7
    score: float
    tier: Tier
    rank: int


class Ranking(BaseModel):
    user_id: str
    weights: Vec7
    shows: list[RankedShow]
    comparisons_done: int


class MatchCandidate(BaseModel):
    user: User
    match_pct: float
    shared_event_ids: list[str]
    explanation: Optional[str]
    icebreaker: Optional[str]


class MediaMatch(BaseModel):
    cluster_id: str
    event: Event
    confidence: float
    photo_count: int
    suggested: Literal["auto", "ask"]


class Message(BaseModel):
    user_id: str
    text: str
    at: str


class PlanOption(BaseModel):
    event_id: str
    tier_label: str
    price: float


class PlanMemberScore(BaseModel):
    user_id: str
    score: float
    note: str


class Plan(BaseModel):
    option: PlanOption
    meet_at: str
    meet_where: str
    per_member: list[PlanMemberScore]
    compromise_note: str
    summary: str


class Crew(BaseModel):
    id: str
    event: Event
    members: list[User]
    messages: list[Message]
    plan: Optional[Plan]


# ---- request bodies & composite responses (AGENTS.md §6) ------------------

class MediaItem(BaseModel):
    lat: float
    lng: float
    captured_at: str


class MediaMatchRequest(BaseModel):
    items: list[MediaItem]


class AttendanceConfirmRequest(BaseModel):
    event_ids: list[str]
    evidence: Literal["photo", "manual"]
    confidences: Optional[list[float]] = None


class AttendanceConfirmResponse(BaseModel):
    added: int


class ReviewIn(BaseModel):
    """POST /reviews body: Review without user_id."""
    event_id: str
    scores: Vec7
    tags: list[str]
    price_paid: Optional[float]


class ComparePair(BaseModel):
    event_a: Event
    event_b: Event


class ReviewPostResponse(BaseModel):
    ok: Literal[True]
    next_compare: ComparePair


class CompareNext(BaseModel):
    event_a: Event
    event_b: Event
    question: str


class CompareRequest(BaseModel):
    event_a: str
    event_b: str
    winner: str


class EventWithFriends(Event):
    friends_interested: list[User]


class EventDetail(BaseModel):
    event: Event
    friends_interested: list[User]
    attendance: Optional[str]


class ErrorResponse(BaseModel):
    error: str


class VerifyStartResponse(BaseModel):
    session_id: str
    url: str


class VerifyWebhook(BaseModel):
    session_id: str
    status: Literal["verified", "failed"]


class OkResponse(BaseModel):
    ok: Literal[True]


class CrewCreateRequest(BaseModel):
    event_id: str
    member_ids: list[str]


class CrewMessageRequest(BaseModel):
    text: str
