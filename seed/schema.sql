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
CREATE TABLE media_items (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), captured_at TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, matched_event_id TEXT, confidence REAL
);
