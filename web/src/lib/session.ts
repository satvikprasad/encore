// Small per-browser conveniences. Every storage access is guarded: private windows
// and blocked storage must never break the demo.

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

export const DEFAULT_USER = "sam";

export function getStoredUserId(): string {
  return read("local", "encore.user") ?? DEFAULT_USER;
}

export function setStoredUserId(id: string) {
  write("local", "encore.user", id);
}

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
