// Fetch wrapper. Every endpoint can be served from <repo>/fixtures or the real API:
// NEXT_PUBLIC_USE_FIXTURES=true serves everything from fixtures (every endpoint is green, so the real
// API is the default), and OVERRIDES pins individual endpoints either way.
import type {
  ArtistHit,
  AttendanceConfirmRequest,
  AttendanceConfirmResponse,
  AttendanceSetResponse,
  AttendanceStatus,
  CompareNext,
  CompareRequest,
  Crew,
  Event,
  EventCreateRequest,
  EventDetail,
  EventWithFriends,
  FollowResponse,
  MatchCandidate,
  MediaFile,
  MediaItem,
  MediaMatch,
  PersonCard,
  Ranking,
  RecommendedEvent,
  ReviewIn,
  ReviewPostResponse,
  TicketOffer,
  User,
  UserProfile,
  Vec7,
  VerifyStartResponse,
} from "@/types";
import { deleteMedia as localDelete, listAllMedia as localAll, listMedia as localList, saveMedia as localSave, type StoredMedia } from "@/lib/media";
import {
  fxFollows,
  fxImported,
  fxMarkImported,
  fxMarkReviewed,
  fxReviewed,
  fxSetFollows,
  fxSetStatus,
  fxStatuses,
  isFixtureVerified,
} from "@/lib/session";

import artistSearchFx from "@fixtures/artist_search.json";
import attendanceConfirmFx from "@fixtures/attendance_confirm.json";
import compareNextFx from "@fixtures/compare_next.json";
import comparePostFx from "@fixtures/compare_post.json";
import crewCreateFx from "@fixtures/crew_create.json";
import crewGetFx from "@fixtures/crew_get.json";
import crewPlanFx from "@fixtures/crew_plan.json";
import eventCreateFx from "@fixtures/event_create.json";
import eventDetailFx from "@fixtures/event_detail.json";
import eventsRecommendedFx from "@fixtures/events_recommended.json";
import eventsSearchFx from "@fixtures/events_search.json";
import eventsUpcomingFx from "@fixtures/events_upcoming.json";
import followsFx from "@fixtures/follows.json";
import matchesFx from "@fixtures/matches.json";
import matchesLockedFx from "@fixtures/matches_locked.json";
import mediaMatchFx from "@fixtures/media_match.json";
import peopleFx from "@fixtures/people.json";
import rankFx from "@fixtures/rank.json";
import reviewPostFx from "@fixtures/review_post.json";
import ticketsFx from "@fixtures/tickets.json";
import unrankedFx from "@fixtures/unranked.json";
import userProfileFx from "@fixtures/user_profile.json";
import usersFx from "@fixtures/users.json";
import verifyStartFx from "@fixtures/verify_start.json";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES === "true";

export type Endpoint =
  | "users"
  | "mediaMatch"
  | "attendanceConfirm"
  | "postReview"
  | "compareNext"
  | "postCompare"
  | "rank"
  | "eventsUpcoming"
  | "eventsSearch"
  | "eventsRecommended"
  | "eventDetail"
  | "setAttendance"
  | "unranked"
  | "tickets"
  | "media"
  | "createEvent"
  | "matches"
  | "verifyStart"
  | "createCrew"
  | "getCrew"
  | "postMessage"
  | "makePlan"
  | "people"
  | "userProfile"
  | "setFollow";

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

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, user: string | null, body?: unknown): Promise<T> {
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

const stripFriends = (e: Event | EventWithFriends): Event => {
  const { friends_interested: _f, ...event } = e as EventWithFriends;
  return event as Event;
};

/** Every event mentioned anywhere in the fixtures, so any page can resolve an id. */
function fixtureEvents(): Map<string, Event> {
  const profile = userProfileFx as unknown as UserProfile;
  const all: Event[] = [
    ...(eventsUpcomingFx as unknown as Event[]),
    ...(eventsRecommendedFx as unknown as Event[]),
    ...(eventsSearchFx as unknown as Event[]),
    ...(unrankedFx as unknown as Event[]),
    ...(mediaMatchFx as unknown as MediaMatch[]).map((m) => m.event),
    ...(rankFx as unknown as Ranking).shows.map((s) => s.event),
    ...profile.shows.map((s) => s.event),
    ...profile.upcoming.map((u) => u.event),
    (eventDetailFx as unknown as EventDetail).event,
  ];
  const map = new Map<string, Event>();
  for (const e of all) {
    const event = stripFriends(e);
    if (!map.has(event.id)) map.set(event.id, event);
  }
  return map;
}

/** friends_interested for an event id, from whichever fixture lists it. */
function fixtureFriends(id: string): User[] {
  const lists = [eventsUpcomingFx, eventsRecommendedFx, eventsSearchFx] as unknown as EventWithFriends[][];
  for (const list of lists) {
    const hit = list.find((e) => e.id === id);
    if (hit) return hit.friends_interested;
  }
  return [];
}

function fixtureStatus(user: string, event: Event): AttendanceStatus | null {
  const marked = fxStatuses(user)[event.id];
  if (marked !== undefined) return marked;
  // Sam's photo shows count as attended once the import ran; his older reviewed shows always do.
  const photoShow = (unrankedFx as unknown as Event[]).some((e) => e.id === event.id);
  const reviewed = (rankFx as unknown as Ranking).shows.some((s) => s.event.id === event.id);
  if (reviewed || (photoShow && fxImported(user))) return "attended";
  return null;
}

function fixtureFollowing(user: string): string[] {
  return fxFollows(user) ?? (followsFx as FollowResponse).following;
}

/** Fixture mode has no media server: browser-stored files stand in, shaped like the API's MediaFile. */
function localAsMediaFile(user: string, m: StoredMedia): MediaFile {
  const everyone = [...(usersFx as unknown as User[]), ...(peopleFx as unknown as PersonCard[]).map((p) => p.user)];
  const owner = everyone.find((u) => u.id === user) ?? { id: user, name: user, avatar: "", budget_max: null, accessibility_needs: [], verified: false, weights: [0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1426] as Vec7 };
  const event = fixtureEvents().get(m.eventId) ?? (eventDetailFx as unknown as EventDetail).event;
  return { id: m.id, user: owner, event, kind: m.kind, url: URL.createObjectURL(m.blob), content_type: m.blob.type, bytes: m.blob.size, caption: null, taken_at: null, created_at: m.addedAt };
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
    if (usesFixture("attendanceConfirm")) {
      fxMarkImported(user);
      for (const id of body.event_ids) fxSetStatus(user, id, "attended");
      return fixture({ ...(attendanceConfirmFx as AttendanceConfirmResponse), added: body.event_ids.length });
    }
    return request("POST", "/attendance/confirm", user, body);
  },

  /** Mark one show by hand: "interested" (want to go), "going", "attended" (went), or null to clear. */
  setAttendance(user: string, eventId: string, status: AttendanceStatus | null): Promise<AttendanceSetResponse> {
    if (usesFixture("setAttendance")) {
      fxSetStatus(user, eventId, status);
      return fixture({ event_id: eventId, status }, 120);
    }
    return request("POST", "/attendance", user, { event_id: eventId, status });
  },

  /** Shows the user went to but hasn't reviewed — the "Rank it now" prompt. */
  unranked(user: string): Promise<Event[]> {
    if (usesFixture("unranked")) {
      const reviewed = new Set(fxReviewed(user));
      const statuses = fxStatuses(user);
      const events = fixtureEvents();
      const manual = Object.entries(statuses)
        .filter(([id, s]) => s === "attended" && !reviewed.has(id))
        .map(([id]) => events.get(id))
        .filter((e): e is Event => !!e);
      const photo = fxImported(user)
        ? (unrankedFx as unknown as Event[]).filter((e) => !reviewed.has(e.id) && statuses[e.id] !== null)
        : [];
      const seen = new Set<string>();
      return fixture([...photo, ...manual].filter((e) => !seen.has(e.id) && seen.add(e.id)), 150);
    }
    return request("GET", "/attendance/unranked", user);
  },

  postReview(user: string, review: ReviewIn): Promise<ReviewPostResponse> {
    if (usesFixture("postReview")) {
      compareCount = 0;
      fxMarkReviewed(user, review.event_id);
      fxSetStatus(user, review.event_id, "attended");
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

  /** Most recent past shows in town — quick picks for "Log a show". */
  async eventsPast(user: string, limit = 12): Promise<Event[]> {
    if (usesFixture("eventsUpcoming")) {
      const past = Array.from(fixtureEvents().values())
        .filter((e) => e.is_past)
        .sort((a, b) => b.start_at.localeCompare(a.start_at));
      return fixture(past.slice(0, limit));
    }
    const all = await request<EventWithFriends[]>("GET", "/events?upcoming=false", user);
    return all.slice(0, limit).map(stripFriends);
  },

  /** Search artists, venues and genres across past and upcoming shows (upcoming first). */
  eventsSearch(user: string, q: string, limit = 40): Promise<EventWithFriends[]> {
    if (usesFixture("eventsSearch")) {
      const needle = q.trim().toLowerCase();
      const hits = Array.from(fixtureEvents().values())
        .filter((e) => [e.artist.name, e.venue.name, ...e.artist.genres].some((s) => s.toLowerCase().includes(needle)))
        .sort((a, b) => (a.is_past === b.is_past ? (a.is_past ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at)) : a.is_past ? 1 : -1))
        .slice(0, limit)
        .map((e) => ({ ...e, friends_interested: fixtureFriends(e.id) }));
      return fixture(needle ? hits : [], 180);
    }
    return request("GET", `/events?q=${encodeURIComponent(q)}&limit=${limit}`, user);
  },

  /** "For you": the top upcoming shows with a one-line reason each. */
  eventsRecommended(user: string, limit = 5): Promise<RecommendedEvent[]> {
    if (usesFixture("eventsRecommended")) {
      const statuses = fxStatuses(user);
      return fixture((eventsRecommendedFx as unknown as RecommendedEvent[]).filter((e) => !statuses[e.id]).slice(0, limit));
    }
    return request("GET", `/events/recommended?limit=${limit}`, user);
  },

  eventDetail(user: string, id: string): Promise<EventDetail> {
    if (usesFixture("eventDetail")) {
      const detail = eventDetailFx as unknown as EventDetail;
      if (id === detail.event.id) return fixture({ ...detail, attendance: fixtureStatus(user, detail.event) });
      const event = fixtureEvents().get(id);
      if (!event) return Promise.reject(new ApiError(404, { error: "not_found" }));
      return fixture({ event, friends_interested: fixtureFriends(id), attendance: fixtureStatus(user, event) });
    }
    return request("GET", `/events/${encodeURIComponent(id)}`, user);
  },

  // ---- photos & videos -------------------------------------------------------------

  /** Upload one file as the raw request body; `onProgress` gets 0…1. Visible to the uploader's followers. */
  uploadMedia(user: string, eventId: string, file: File, onProgress?: (pct: number) => void, caption?: string): Promise<MediaFile> {
    if (usesFixture("media")) return localSave(user, eventId, [file]).then((rows) => localAsMediaFile(user, rows[0]));
    return new Promise((resolve, reject) => {
      const url = new URL("/media/upload", API_URL);
      url.searchParams.set("user", user);
      url.searchParams.set("event", eventId);
      url.searchParams.set("name", file.name);
      if (caption) url.searchParams.set("caption", caption);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.toString());
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        const json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) resolve(json as MediaFile);
        else reject(new ApiError(xhr.status, json));
      };
      xhr.onerror = () => reject(new ApiError(0, { error: "network" }));
      xhr.send(file);
    });
  },

  /** A show's media: yours plus people you follow. */
  eventMedia(user: string, eventId: string): Promise<MediaFile[]> {
    if (usesFixture("media")) return localList(user, eventId).then((rows) => rows.map((m) => localAsMediaFile(user, m)));
    return request("GET", `/media?event=${encodeURIComponent(eventId)}`, user);
  },

  /** A member's media — only when you follow them (or it's you). */
  userMedia(user: string, of: string): Promise<MediaFile[]> {
    if (usesFixture("media")) return of === user ? localAll(user).then((rows) => rows.map((m) => localAsMediaFile(user, m))) : Promise.resolve([]);
    return request("GET", `/media?of=${encodeURIComponent(of)}`, user);
  },

  /** Friends' moments: the latest from people you follow. */
  mediaFeed(user: string): Promise<MediaFile[]> {
    if (usesFixture("media")) return Promise.resolve([]);
    return request("GET", "/media/feed", user);
  },

  deleteMedia(user: string, id: string): Promise<{ ok: true }> {
    if (usesFixture("media")) return localDelete(id).then(() => ({ ok: true as const }));
    return request("DELETE", `/media/${encodeURIComponent(id)}`, user);
  },

  /** Artist autocomplete (Deezer, via the API) for the add-a-show form. */
  searchArtists(q: string): Promise<ArtistHit[]> {
    if (usesFixture("createEvent")) {
      const needle = q.trim().toLowerCase();
      return fixture((artistSearchFx as unknown as ArtistHit[]).filter((a) => a.name.toLowerCase().includes(needle)), 120);
    }
    return request("GET", `/artists/search?q=${encodeURIComponent(q)}`, null);
  },

  /** Add a show the calendars don't have. Same artist + venue + night returns the existing show. */
  createEvent(user: string, body: EventCreateRequest): Promise<Event> {
    if (usesFixture("createEvent")) {
      const sample = eventCreateFx as unknown as Event;
      const venue = Array.from(fixtureEvents().values()).find((e) => e.venue.id === body.venue || e.venue.name.toLowerCase() === body.venue.toLowerCase())?.venue ?? sample.venue;
      const today = new Date().toISOString().slice(0, 10);
      return fixture({
        ...sample,
        id: `u_${Date.now().toString(36)}`,
        artist: { id: body.artist.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: body.artist, genres: [] },
        venue,
        start_at: `${body.date}T${body.time ?? "20:00"}:00-04:00`,
        image_url: null,
        support: body.support ?? null,
        is_past: body.date < today,
      });
    }
    return request("POST", "/events", user, body);
  },

  /** Where to buy a show: official seller(s) plus resale, cheapest known price first. */
  tickets(user: string, eventId: string): Promise<TicketOffer[]> {
    if (usesFixture("tickets")) {
      const event = fixtureEvents().get(eventId);
      const fx = ticketsFx as unknown as TicketOffer[];
      return fixture(event?.tm_url ? [{ ...fx[0], url: event.tm_url }, ...fx.slice(1)] : fx, 200);
    }
    return request("GET", `/events/${encodeURIComponent(eventId)}/tickets`, user);
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

  /** Every other member, best taste match first; `q` filters by name. */
  people(user: string, q = ""): Promise<PersonCard[]> {
    if (usesFixture("people")) {
      const following = new Set(fixtureFollowing(user));
      const needle = q.trim().toLowerCase();
      return fixture(
        (peopleFx as unknown as PersonCard[])
          .filter((p) => p.user.id !== user && (!needle || p.user.name.toLowerCase().includes(needle)))
          .map((p) => ({ ...p, following: following.has(p.user.id) })),
        150,
      );
    }
    return request("GET", `/people?q=${encodeURIComponent(q)}`, user);
  },

  userProfile(user: string, id: string): Promise<UserProfile> {
    if (usesFixture("userProfile")) {
      const following = fixtureFollowing(user);
      const fx = userProfileFx as unknown as UserProfile;
      if (id === fx.user.id) return fixture({ ...fx, following: following.includes(id) });
      const everyone = [...(usersFx as unknown as User[]), ...(peopleFx as unknown as PersonCard[]).map((p) => p.user)];
      const u = everyone.find((x) => x.id === id);
      if (!u) return Promise.reject(new ApiError(404, { error: "not_found" }));
      if (id === user) {
        const events = fixtureEvents();
        const upcoming = Object.entries(fxStatuses(user))
          .filter(([, s]) => s === "interested" || s === "going")
          .map(([eid, s]) => ({ event: events.get(eid)!, status: s as "interested" | "going" }))
          .filter((x) => x.event);
        const shows = user === "sam" ? (rankFx as unknown as Ranking).shows : [];
        return fixture({ user: u, following: false, follows_you: false, followers: 3, following_count: following.length, match_pct: null, shows, upcoming });
      }
      const card = (peopleFx as unknown as PersonCard[]).find((p) => p.user.id === id);
      return fixture({
        user: u,
        following: following.includes(id),
        follows_you: card?.follows_you ?? false,
        followers: 2,
        following_count: 3,
        match_pct: card?.match_pct ?? 70,
        shows: [],
        upcoming: [],
      });
    }
    return request("GET", `/users/${encodeURIComponent(id)}`, user);
  },

  setFollow(user: string, id: string, follow: boolean): Promise<FollowResponse> {
    if (usesFixture("setFollow")) {
      const cur = new Set(fixtureFollowing(user));
      if (follow) cur.add(id);
      else cur.delete(id);
      const following = Array.from(cur).sort();
      fxSetFollows(user, following);
      return fixture({ following }, 120);
    }
    return request("POST", "/follows", user, { user_id: id, follow });
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
