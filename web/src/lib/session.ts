// Small per-browser conveniences. Every storage access is guarded: private windows
// and blocked storage must never break the demo.
import type { AttendanceStatus } from "@/types";

function read(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(store: "local" | "session", key: string, value: string | null) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readJson<T>(store: "local" | "session", key: string, fallback: T): T {
  const raw = read(store, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const DEFAULT_USER = "sam";

export function getStoredUserId(): string {
  return read("local", "encore.user") ?? DEFAULT_USER;
}

export function setStoredUserId(id: string) {
  write("local", "encore.user", id);
}

// ---- "Rank it now" prompt --------------------------------------------------------

// Dismissing the prompt for a show lasts the browser session, so it doesn't nag on every open.
export function isPromptDismissed(user: string, eventId: string): boolean {
  return readJson<string[]>("session", `encore.dismissed.${user}`, []).includes(eventId);
}

export function dismissPrompt(user: string, eventIds: string[]) {
  const cur = readJson<string[]>("session", `encore.dismissed.${user}`, []);
  write("session", `encore.dismissed.${user}`, JSON.stringify(Array.from(new Set([...cur, ...eventIds]))));
}

// ---- verify flow -----------------------------------------------------------------

// Fixture mode has no server-side verified flag, so the verify flow sets this one.
export function isFixtureVerified(user: string): boolean {
  return read("session", `encore.fx.verified.${user}`) === "1";
}

export function setFixtureVerified(user: string) {
  write("session", `encore.fx.verified.${user}`, "1");
}

// Set by /verify just before routing back, so the event page can play the unlock animation.
// Cleared shortly after the first read rather than on it, so React StrictMode's double
// effect run in dev sees the same value both times.
export function consumeJustVerified(): boolean {
  const v = read("session", "encore.justVerified") === "1";
  if (v) setTimeout(() => write("session", "encore.justVerified", null), 1500);
  return v;
}

export function markJustVerified() {
  write("session", "encore.justVerified", "1");
}

export function getAdoptedPlan(crewId: string): boolean {
  return read("session", `encore.adopted.${crewId}`) === "1";
}

export function setAdoptedPlan(crewId: string) {
  write("session", `encore.adopted.${crewId}`, "1");
}

// ---- fixture-mode state (no API to remember marks, follows, reviews) ----------------

/** Marks the user set this session: event id → status (null = cleared). */
export function fxStatuses(user: string): Record<string, AttendanceStatus | null> {
  return readJson("session", `encore.fx.status.${user}`, {});
}

export function fxSetStatus(user: string, eventId: string, status: AttendanceStatus | null) {
  write("session", `encore.fx.status.${user}`, JSON.stringify({ ...fxStatuses(user), [eventId]: status }));
}

/** Who the user follows; null until first changed (callers seed from the fixture). */
export function fxFollows(user: string): string[] | null {
  return readJson<string[] | null>("session", `encore.fx.follows.${user}`, null);
}

export function fxSetFollows(user: string, ids: string[]) {
  write("session", `encore.fx.follows.${user}`, JSON.stringify(ids));
}

export function fxReviewed(user: string): string[] {
  return readJson("session", `encore.fx.reviewed.${user}`, []);
}

export function fxMarkReviewed(user: string, eventId: string) {
  write("session", `encore.fx.reviewed.${user}`, JSON.stringify(Array.from(new Set([...fxReviewed(user), eventId]))));
}

export function fxImported(user: string): boolean {
  return read("session", `encore.fx.imported.${user}`) === "1";
}

export function fxMarkImported(user: string) {
  write("session", `encore.fx.imported.${user}`, "1");
}
