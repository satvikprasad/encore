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
    tm_url: Optional[str]                 # primary seller's page for this show (Ticketmaster, AXS, ...)
    image_url: Optional[str] = None       # poster from the venue site
    support: Optional[str] = None         # opening acts
    room: Optional[str] = None            # multi-room venues (The Masquerade: Heaven / Hell / Purgatory / Altar)
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
    item_indices: list[int] = []   # positions in the request's items that formed this cluster


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
    next_compare: Optional[ComparePair]  # null until the user has reviewed 2 shows


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


# ---- discovery: search, recommendations, status, people ------------------

class RecommendedEvent(EventWithFriends):
    """GET /events/recommended: an upcoming show plus why it is on the list."""
    reason: str
    score: float


AttendanceStatus = Literal["interested", "going", "attended"]


class AttendanceSetRequest(BaseModel):
    """POST /attendance: mark one show. status null clears the mark."""
    event_id: str
    status: Optional[AttendanceStatus]


class AttendanceSetResponse(BaseModel):
    event_id: str
    status: Optional[AttendanceStatus]


class PersonCard(BaseModel):
    """GET /people: a member as seen by the caller."""
    user: User
    match_pct: int
    shows_count: int
    following: bool
    follows_you: bool


class UpcomingPlan(BaseModel):
    event: Event
    status: Literal["interested", "going"]


class UserProfile(BaseModel):
    """GET /users/{id}: a member's page. match_pct is null when viewing yourself."""
    user: User
    following: bool
    follows_you: bool
    followers: int
    following_count: int
    match_pct: Optional[int]
    shows: list[RankedShow]
    upcoming: list[UpcomingPlan]


class TicketOffer(BaseModel):
    """GET /events/{id}/tickets: one seller's page for the show. Prices are null until a keyed
    source (Ticketmaster Discovery, SeatGeek) has filled them in."""
    seller: str
    kind: Literal["primary", "resale"]
    url: str
    price_min: Optional[float]
    price_max: Optional[float]
    status: Optional[str]
    fetched_at: str


class FollowRequest(BaseModel):
    user_id: str
    follow: bool


class FollowResponse(BaseModel):
    following: list[str]


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
