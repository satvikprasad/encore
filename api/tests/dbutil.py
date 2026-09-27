"""Test DB builder. Uses seed/schema.sql (M1) when present; otherwise a verbatim
copy of AGENTS.md §3 so M4's tests can run before M1 ships the schema."""
import json
import sqlite3
from pathlib import Path

SCHEMA_FILE = Path(__file__).resolve().parents[2] / "seed" / "schema.sql"

AGENTS_SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, home_city TEXT DEFAULT 'Atlanta',
  budget_max REAL, accessibility_needs TEXT NOT NULL DEFAULT '[]',   -- JSON array of need codes
  verified INTEGER NOT NULL DEFAULT 0, verified_at TEXT, verification_ref TEXT,
  weights TEXT NOT NULL DEFAULT '[0.1429,0.1429,0.1429,0.1429,0.1429,0.1429,0.1426]' -- JSON w_u
);
CREATE TABLE artists (id TEXT PRIMARY KEY, name TEXT NOT NULL, tm_id TEXT, genres TEXT DEFAULT '[]');
CREATE TABLE venues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tm_id TEXT, lat REAL NOT NULL, lng REAL NOT NULL,
  geofence_radius_m INTEGER NOT NULL DEFAULT 150, multi_room INTEGER NOT NULL DEFAULT 0,
  access_profile TEXT NOT NULL DEFAULT '{}'    -- JSON: step_free, ada_seating, quiet_room, strobe_policy, interpreter
);
CREATE TABLE events (
  id TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id), venue_id TEXT NOT NULL REFERENCES venues(id),
  start_at TEXT NOT NULL, doors_at TEXT, price_min REAL, price_max REAL, tm_url TEXT,
  is_past INTEGER NOT NULL, source TEXT NOT NULL   -- 'ticketmaster' | 'setlistfm' | 'demo'
);
CREATE INDEX idx_events_venue_time ON events(venue_id, start_at);
CREATE TABLE attendance (
  user_id TEXT REFERENCES users(id), event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL CHECK(status IN ('interested','going','attended')),
  evidence TEXT NOT NULL DEFAULT 'manual' CHECK(evidence IN ('photo','ticket','manual')),
  confidence REAL NOT NULL DEFAULT 1.0, PRIMARY KEY(user_id, event_id)
);
CREATE TABLE reviews (
  user_id TEXT REFERENCES users(id), event_id TEXT REFERENCES events(id),
  music INTEGER, crowd INTEGER, venue INTEGER, accessibility INTEGER, production INTEGER, value INTEGER,
  would_again INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '[]', price_paid REAL,
  theta TEXT NOT NULL, theta_var REAL NOT NULL DEFAULT 1.0,   -- JSON 7-vector, scalar variance
  PRIMARY KEY(user_id, event_id)
);
CREATE TABLE comparisons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id),
  event_a TEXT REFERENCES events(id), event_b TEXT REFERENCES events(id), winner TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE follows (follower_id TEXT REFERENCES users(id), followee_id TEXT REFERENCES users(id), PRIMARY KEY(follower_id, followee_id));
CREATE TABLE crews (
  id TEXT PRIMARY KEY, event_id TEXT REFERENCES events(id), member_ids TEXT NOT NULL,  -- JSON array
  messages TEXT NOT NULL DEFAULT '[]', plan TEXT   -- JSON
);
"""

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def make_db(path: Path) -> sqlite3.Connection:
    """Create a small DB seeded from the fixtures' users/events and Sam's follows."""
    ddl = SCHEMA_FILE.read_text() if SCHEMA_FILE.exists() else AGENTS_SCHEMA
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(ddl)
    users = json.loads((FIXTURES / "users.json").read_text())
    for u in users:
        conn.execute(
            "INSERT INTO users (id, name, avatar, budget_max, accessibility_needs, verified, weights)"
            " VALUES (?,?,?,?,?,?,?)",
            (u["id"], u["name"], u["avatar"], u["budget_max"], json.dumps(u["accessibility_needs"]),
             int(u["verified"]), json.dumps(u["weights"])),
        )
    events = {e["id"]: e for e in json.loads((FIXTURES / "events_upcoming.json").read_text())}
    for e in json.loads((FIXTURES / "unranked.json").read_text()):  # d01–d06
        events.setdefault(e["id"], e)
    for s in json.loads((FIXTURES / "rank.json").read_text())["shows"]:
        events[s["event"]["id"]] = s["event"]
    detail = json.loads((FIXTURES / "event_detail.json").read_text())["event"]  # t01, whatever the slice holds
    events.setdefault(detail["id"], detail)
    for e in events.values():
        a, v = e["artist"], e["venue"]
        conn.execute("INSERT OR IGNORE INTO artists (id, name, genres) VALUES (?,?,?)",
                     (a["id"], a["name"], json.dumps(a["genres"])))
        conn.execute("INSERT OR IGNORE INTO venues (id, name, lat, lng, multi_room, access_profile)"
                     " VALUES (?,?,?,?,?,?)",
                     (v["id"], v["name"], v["lat"], v["lng"], int(v["multi_room"]), json.dumps(v["access_profile"])))
        conn.execute("INSERT INTO events (id, artist_id, venue_id, start_at, doors_at, price_min, price_max,"
                     " tm_url, is_past, source) VALUES (?,?,?,?,?,?,?,?,?, 'demo')",
                     (e["id"], a["id"], v["id"], e["start_at"], e["doors_at"], e["price_min"], e["price_max"],
                      e["tm_url"], int(e["is_past"])))
    follows = [("sam", "priya"), ("sam", "dev"), ("sam", "lena"), ("maya", "priya"), ("jordan", "dev")]
    conn.executemany("INSERT INTO follows VALUES (?,?)", follows)
    for uid in ("maya", "jordan", "priya"):
        conn.execute("INSERT INTO attendance (user_id, event_id, status) VALUES (?, 't01', 'interested')", (uid,))
    conn.commit()
    return conn
