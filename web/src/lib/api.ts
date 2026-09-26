// Fetch wrapper. Every endpoint can be served from <repo>/fixtures or the real API:
// NEXT_PUBLIC_USE_FIXTURES sets the default, and OVERRIDES flips endpoints one at a time
// as teammates announce them green.
import type {
  AttendanceConfirmRequest,
  AttendanceConfirmResponse,
  CompareNext,
  CompareRequest,
  Crew,
  Event,
  EventDetail,
  EventWithFriends,
  MatchCandidate,
  MediaItem,
  MediaMatch,
  Ranking,
  ReviewIn,
  ReviewPostResponse,
  User,
  Vec7,
  VerifyStartResponse,
} from "@/types";
import { isFixtureVerified } from "@/lib/session";

import attendanceConfirmFx from "@fixtures/attendance_confirm.json";
import compareNextFx from "@fixtures/compare_next.json";
import comparePostFx from "@fixtures/compare_post.json";
import crewCreateFx from "@fixtures/crew_create.json";
import crewGetFx from "@fixtures/crew_get.json";
import crewPlanFx from "@fixtures/crew_plan.json";
import eventDetailFx from "@fixtures/event_detail.json";
import eventsUpcomingFx from "@fixtures/events_upcoming.json";
import matchesFx from "@fixtures/matches.json";
import matchesLockedFx from "@fixtures/matches_locked.json";
import mediaMatchFx from "@fixtures/media_match.json";
import rankFx from "@fixtures/rank.json";
import reviewPostFx from "@fixtures/review_post.json";
import usersFx from "@fixtures/users.json";
import verifyStartFx from "@fixtures/verify_start.json";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES !== "false";

export type Endpoint =
  | "users"
  | "mediaMatch"
  | "attendanceConfirm"
  | "postReview"
  | "compareNext"
  | "postCompare"
  | "rank"
  | "eventsUpcoming"
  | "eventDetail"
  | "matches"
  | "verifyStart"
  | "createCrew"
  | "getCrew"
  | "postMessage"
  | "makePlan";

// true = fixture, false = real API. Anything not listed follows NEXT_PUBLIC_USE_FIXTURES.
const OVERRIDES: Partial<Record<Endpoint, boolean>> = {
  // users: false,
};

export function usesFixture(endpoint: Endpoint): boolean {
  return OVERRIDES[endpoint] ?? USE_FIXTURES;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}: ${JSON.stringify(body)}`);
  }
  get code(): string | undefined {
    const b = this.body as { error?: string } | null;
    return b?.error;
  }
}

// Structured-clone so callers can mutate fixture data freely.
const clone = <T,>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fixture<T>(data: unknown, ms = 250): Promise<T> {
  await delay(ms);
  return clone<T>(data);
}

async function request<T>(method: "GET" | "POST", path: string, user: string | null, body?: unknown): Promise<T> {
  const url = new URL(path, API_URL);
  if (user) url.searchParams.set("user", user);
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

// ---- fixture-mode helpers ---------------------------------------------------------

/** Every event mentioned anywhere in the fixtures, so any page can resolve an id. */
function fixtureEvents(): Map<string, Event> {
  const all: Event[] = [
    ...(eventsUpcomingFx as unknown as Event[]),
    ...(mediaMatchFx as unknown as MediaMatch[]).map((m) => m.event),
    ...(rankFx as unknown as Ranking).shows.map((s) => s.event),
    (eventDetailFx as unknown as EventDetail).event,
  ];
  const map = new Map<string, Event>();
  for (const e of all) {
    // Strip friends_interested from EventWithFriends entries.
    const { friends_interested: _f, ...event } = e as EventWithFriends;
    if (!map.has(event.id)) map.set(event.id, event as Event);
  }
  return map;
}

let compareCount = 0;

function lerp7(a: Vec7, b: Vec7, t: number): Vec7 {
  return a.map((x, i) => +(x + (b[i] - x) * t).toFixed(4)) as Vec7;
}

// Crews in fixture mode live in sessionStorage so chat + plan survive navigation.
const CREW_KEY = "encore.fx.crews";

function loadCrews(): Record<string, Crew> {
  try {
    return JSON.parse(sessionStorage.getItem(CREW_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCrew(crew: Crew): Crew {
  try {
    sessionStorage.setItem(CREW_KEY, JSON.stringify({ ...loadCrews(), [crew.id]: crew }));
  } catch {
    /* storage unavailable: state just won't persist */
  }
  return crew;
}

// ---- endpoints -------------------------------------------------------------------

export const api = {
  users(): Promise<User[]> {
    if (usesFixture("users")) return fixture(usersFx, 100);
    return request("GET", "/users", null);
  },

  mediaMatch(user: string, items: MediaItem[]): Promise<MediaMatch[]> {
    if (usesFixture("mediaMatch")) return fixture(mediaMatchFx, 700);
    return request("POST", "/media/match", user, { items });
  },

  attendanceConfirm(user: string, body: AttendanceConfirmRequest): Promise<AttendanceConfirmResponse> {
    if (usesFixture("attendanceConfirm")) return fixture({ added: body.event_ids.length });
    return request("POST", "/attendance/confirm", user, body);
  },

  postReview(user: string, review: ReviewIn): Promise<ReviewPostResponse> {
    if (usesFixture("postReview")) {
      compareCount = 0;
      return fixture(reviewPostFx);
    }
    return request("POST", "/reviews", user, review);
  },

  compareNext(user: string): Promise<CompareNext | null> {
    if (usesFixture("compareNext")) return fixture(compareNextFx);
    return request("GET", "/compare/next", user);
  },

  async postCompare(user: string, body: CompareRequest): Promise<Ranking> {
    if (usesFixture("postCompare")) {
      // Walk the weights from compare_post.json toward rank.json so the bars visibly move.
      const first = comparePostFx as unknown as Ranking;
      const last = rankFx as unknown as Ranking;
      const t = Math.min(compareCount, 2) / 2;
      compareCount += 1;
      const ranking = await fixture<Ranking>(t === 1 ? last : first);
      ranking.weights = lerp7(first.weights, last.weights, t);
      ranking.comparisons_done = compareCount;
      return ranking;
    }
    return request("POST", "/compare", user, body);
  },

  rank(user: string): Promise<Ranking> {
    if (usesFixture("rank")) return fixture(rankFx);
    return request("GET", "/rank", user);
  },

  eventsUpcoming(user: string): Promise<EventWithFriends[]> {
    if (usesFixture("eventsUpcoming")) return fixture(eventsUpcomingFx);
    return request("GET", "/events?upcoming=true", user);
  },

  eventDetail(user: string, id: string): Promise<EventDetail> {
    if (usesFixture("eventDetail")) {
      const detail = eventDetailFx as unknown as EventDetail;
      if (id === detail.event.id) return fixture(detail);
      const event = fixtureEvents().get(id);
      if (!event) return Promise.reject(new ApiError(404, { error: "not_found" }));
      const upcoming = (eventsUpcomingFx as unknown as EventWithFriends[]).find((e) => e.id === id);
      return fixture({
        event,
        friends_interested: upcoming?.friends_interested ?? [],
        attendance: event.is_past ? "attended" : null,
      });
    }
    return request("GET", `/events/${encodeURIComponent(id)}`, user);
  },

  async matches(user: string, eventId: string): Promise<MatchCandidate[]> {
    if (usesFixture("matches")) {
      if (!isFixtureVerified(user)) {
        await delay(250);
        throw new ApiError(403, clone(matchesLockedFx));
      }
      return fixture(matchesFx, 600);
    }
    return request("GET", `/matches/${encodeURIComponent(eventId)}`, user);
  },

  verifyStart(user: string): Promise<VerifyStartResponse> {
    if (usesFixture("verifyStart")) return fixture(verifyStartFx);
    return request("POST", "/verify/start", user);
  },

  async createCrew(user: string, eventId: string, memberIds: string[]): Promise<Crew> {
    if (usesFixture("createCrew")) {
      const crew = await fixture<Crew>(crewCreateFx);
      const everyone = usersFx as unknown as User[];
      const ids = Array.from(new Set([user, ...memberIds]));
      const members = ids.map((id) => everyone.find((u) => u.id === id)).filter((u): u is User => !!u);
      const event = fixtureEvents().get(eventId);
      return saveCrew({ ...crew, members: members.length ? members : crew.members, event: event ?? crew.event });
    }
    return request("POST", "/crews", user, { event_id: eventId, member_ids: memberIds });
  },

  getCrew(user: string, id: string): Promise<Crew> {
    if (usesFixture("getCrew")) return fixture(loadCrews()[id] ?? crewGetFx);
    return request("GET", `/crews/${encodeURIComponent(id)}`, user);
  },

  async postMessage(user: string, id: string, text: string): Promise<Crew> {
    if (usesFixture("postMessage")) {
      const crew = await fixture<Crew>(loadCrews()[id] ?? crewGetFx, 120);
      crew.messages.push({ user_id: user, text, at: new Date().toISOString() });
      return saveCrew(crew);
    }
    return request("POST", `/crews/${encodeURIComponent(id)}/messages`, user, { text });
  },

  async makePlan(user: string, id: string): Promise<Crew> {
    if (usesFixture("makePlan")) {
      const crew = await fixture<Crew>(loadCrews()[id] ?? crewGetFx, 1200);
      crew.plan = clone((crewPlanFx as unknown as Crew).plan);
      return saveCrew(crew);
    }
    return request("POST", `/crews/${encodeURIComponent(id)}/plan`, user);
  },
};
