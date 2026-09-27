# AGENTS.md — Encore (HackGT 13)

*Read this whole file before writing any code. `DESIGN.md` is the why; this file is the how. When they conflict, this file wins.*

---

## 0. Ground rules

1. **Stay in your lane.** Each member owns directories listed in §1. Do not edit another owner's directory. If you need something from them, add a fixture in `fixtures/` and message them.
2. **Shared types are a contract.** `api/app/schemas.py` and `web/src/types.ts` mirror each other and mirror §5 of this file. Changing either requires updating both, the affected fixture, and telling the team.
3. **Fixtures first.** Every endpoint has a canned JSON response in `fixtures/`. Frontend builds against fixtures until the real endpoint is green. Backend endpoints are done when their real output validates against the same schema as the fixture.
4. **SQLite, one file.** `data/encore.db`, committed after seeding. Never write migrations; drop and reseed.
5. **Dependencies are the lists in §2.** Ask before adding anything else.
6. **Verification stays mocked.** Do not integrate a real KYC vendor before the demo is end-to-end green.
7. **Only the team's own photos in the repo.** `demo_photos/` holds the team's concert photos/videos (used with permission), seeded as friends' moments via `seed/demo_media.json`.
8. **Demo determinism.** `make seed` must produce byte-identical `encore.db` every run (fixed RNG seed 1313). The demo user Sam is defined in §7, not generated.
9. **Feature freeze 2:00 AM Sunday.** After that, only commits that fix a failing run-through.
10. **Definition of done** for every task is in §9. A task is not done until its check passes.

## 1. Repo layout & ownership

```
encore/
├── DESIGN.md                 # product/design doc
├── AGENTS.md                 # this file
├── Makefile                  # dev, seed, test, demo-reset
├── .env.example
├── data/
│   ├── encore.db             # M1 — committed after seed
│   └── cache/                # M1 — raw API responses (ticketmaster/*.json, setlistfm/*.json)
├── seed/                     # M1
│   ├── seed.py               # entry: python -m seed.seed
│   ├── venues.json           # 7 venues, hand-written (§7.1)
│   ├── demo_events.json      # Sam's past shows + the target show (§7.2)
│   ├── demo_users.json       # Sam, Maya, Jordan + 27 synthetic persona specs (§7.3)
│   ├── fetch_ticketmaster.py
│   ├── fetch_setlistfm.py
│   └── personas.py
├── demo_photos/              # generated JPEGs, seeded as friends' photos (data/media/seed)
│   └── *.jpg
├── fixtures/                 # SHARED, additive only — one file per endpoint (§6)
├── api/                      # M2 (ml/), M4 (verify/, ai/), shared skeleton by M4
│   ├── app/
│   │   ├── main.py           # FastAPI app, router includes, CORS
│   │   ├── db.py             # sqlite3 connection helper
│   │   ├── schemas.py        # Pydantic models — THE CONTRACT
│   │   ├── routers/
│   │   │   ├── attendance.py # marks (want to go / going / went) + the rank-it prompt
│   │   │   ├── reviews.py    # M2
│   │   │   ├── compare.py    # M2
│   │   │   ├── rank.py       # M2
│   │   │   ├── events.py     # M1
│   │   │   ├── matches.py    # M2 (scoring) + M4 (explanation, gate)
│   │   │   ├── verify.py     # M4
│   │   │   └── crews.py      # M4
│   │   ├── ml/               # M2
│   │   │   ├── ranker.py     # Bradley-Terry
│   │   │   ├── taste.py      # taste match
│   │   │   └── group.py      # group plan scorer
│   │   ├── ai/               # M4
│   │   │   ├── grok.py       # client
│   │   │   ├── prompts.py
│   │   │   └── explain.py, plan.py
│   │   └── verify/           # M4
│   │       ├── provider.py   # interface
│   │       └── mock.py
│   └── tests/
├── web/                      # M3
│   ├── src/app/              # Next.js app router pages
│   ├── src/components/
│   ├── src/lib/api.ts        # fetch wrapper; USE_FIXTURES env switch
│   └── src/types.ts          # mirrors schemas.py
└── submission/               # M4
    ├── devpost.md
    ├── meta.md
    ├── video_script.md
    └── notability/           # 2 screenshots
```

## 2. Stack & setup

**Versions:** Python 3.11+, Node 20+, pnpm.

**Python deps (`api/requirements.txt`):**
```
fastapi==0.115.*  uvicorn[standard]  pydantic>=2  numpy  scipy  httpx  python-dotenv  pytest
```
**Node deps (`web/package.json`):** `next@14`, `react`, `recharts`, `tailwindcss`, `clsx`. Nothing else.

**Seed-time only:** `exiftool` (system package: `brew install exiftool` / `apt install libimage-exiftool-perl`), `Pillow` for blank JPEGs.

**`.env.example`:**
```
TICKETMASTER_API_KEY=
SETLISTFM_API_KEY=            # apply at api.setlist.fm — DO THIS FIRST, approval can take hours
GROK_API_KEY=
GROK_BASE_URL=https://api.x.ai/v1      # OpenAI-compatible; confirm against SpaceXAI credit instructions
GROK_MODEL=grok-4              # confirm available model name
API_PORT=8000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_FIXTURES=true  # M3 flips to false per-endpoint as they go green
```

**Makefile:**
```make
dev:        ## run api + web
	(cd api && uvicorn app.main:app --reload --port 8000) & (cd web && pnpm dev)
seed:       ## rebuild data/encore.db deterministically
	python -m seed.seed
test:
	cd api && pytest -q
demo-reset: ## demo user back to unverified, d01–d06 and uploads removed
	python -m seed.demo_reset
```

## 3. Database schema (`seed/schema.sql`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, home_city TEXT DEFAULT 'Atlanta',
  budget_max REAL, accessibility_needs TEXT NOT NULL DEFAULT '[]',   -- JSON array of need codes
  verified INTEGER NOT NULL DEFAULT 0, verified_at TEXT, verification_ref TEXT,
  weights TEXT NOT NULL DEFAULT '[0.1429,0.1429,0.1429,0.1429,0.1429,0.1429,0.1426]' -- JSON w_u
);
CREATE TABLE artists (id TEXT PRIMARY KEY, name TEXT NOT NULL, tm_id TEXT, genres TEXT DEFAULT '[]',
  related TEXT NOT NULL DEFAULT '[]');   -- JSON: similar artists' names (Deezer), see seed/fetch_music.py
CREATE TABLE venues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tm_id TEXT, lat REAL NOT NULL, lng REAL NOT NULL,
  geofence_radius_m INTEGER NOT NULL DEFAULT 150, multi_room INTEGER NOT NULL DEFAULT 0,
  access_profile TEXT NOT NULL DEFAULT '{}',   -- JSON: step_free, ada_seating, quiet_room, strobe_policy, interpreter
  city TEXT NOT NULL DEFAULT 'Atlanta, GA'
);
CREATE TABLE events (
  id TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artists(id), venue_id TEXT NOT NULL REFERENCES venues(id),
  start_at TEXT NOT NULL, doors_at TEXT, price_min REAL, price_max REAL, tm_url TEXT,
  image_url TEXT, support TEXT, room TEXT,          -- from the venue sites (support acts, Masquerade room)
  is_past INTEGER NOT NULL, source TEXT NOT NULL   -- 'ticketmaster' | 'setlistfm' | 'venue' | 'demo'
);
CREATE INDEX idx_events_venue_time ON events(venue_id, start_at);
CREATE TABLE ticket_offers (
  event_id TEXT REFERENCES events(id), seller TEXT NOT NULL,           -- 'Ticketmaster' | 'AXS' | 'SeatGeek' | ...
  kind TEXT NOT NULL CHECK(kind IN ('primary','resale')), url TEXT NOT NULL,
  price_min REAL, price_max REAL, status TEXT, fetched_at TEXT NOT NULL,
  checked_at TEXT,                                                       -- last price lookup (NULL = never)
  PRIMARY KEY(event_id, seller)
);
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
CREATE TABLE media (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL REFERENCES events(id),
  kind TEXT NOT NULL CHECK(kind IN ('image','video')), path TEXT NOT NULL,   -- storage path or public URL (app/storage.py)
  content_type TEXT NOT NULL, bytes INTEGER NOT NULL, caption TEXT, taken_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_media_event ON media(event_id, created_at);
CREATE INDEX idx_media_user ON media(user_id, created_at);
```

Dimension order everywhere (arrays, JSON, TS tuples): **`[music, crowd, venue, accessibility, production, value, would_again]`**. `would_again` is stored as 1 or 5 in θ so it lives on the same scale.

Accessibility need codes: `mobility | sensory | hearing | vision | chronic | neurodivergent`.
Venue `access_profile` keys: `step_free: bool, ada_seating: bool, quiet_room: bool, strobe_policy: "none"|"warned"|"unrestricted", interpreter: "on_request"|"never"`.
Constraint satisfaction (`group.py`): `mobility → step_free && ada_seating`; `sensory|neurodivergent → quiet_room && strobe_policy != "unrestricted"`; `hearing → interpreter == "on_request"`; `vision, chronic → ada_seating`.

## 4. Shared enums & constants (`api/app/constants.py` ↔ `web/src/constants.ts`)

```
DIMS = ["music","crowd","venue","accessibility","production","value","would_again"]
TAGS = {
  music: ["tight","sloppy","deep cuts","played the hits","guest appearance","short set","extended set"],
  crowd: ["mosh","chill","singalong","phone-heavy","rowdy","respectful"],
  venue: ["great sound","muddy","good sightlines","cramped","long bar lines","easy in/out"],
  accessibility: ["ADA honored","strobes used","interpreter present","re-entry allowed","quiet space","accessible line long"],
  production: ["lasers","LED wall","pyro","minimal","mix too loud","mix too quiet"],
  value: ["worth it","overpriced","fees hurt","merch reasonable"],
}
TIERS = S: top 15% | A: next 25% | B: next 35% | C: rest   (by rank position)
MATCH_THRESHOLDS = { auto: 0.8, ask: 0.4 }
RANKER = { beta: 1.0, eta: 0.3, var_shrink: 0.8, prior_var: 1.0 }
GROUP_LAMBDA = 0.5
```

## 5. Types — the contract

`api/app/schemas.py` (Pydantic v2) and `web/src/types.ts` must match this exactly.

```ts
type Vec7 = [number,number,number,number,number,number,number];
type Need = "mobility"|"sensory"|"hearing"|"vision"|"chronic"|"neurodivergent";

interface User { id:string; name:string; avatar:string; budget_max:number|null; accessibility_needs:Need[]; verified:boolean; weights:Vec7 }
interface Artist { id:string; name:string; genres:string[] }
interface Venue { id:string; name:string; lat:number; lng:number; multi_room:boolean; city?:string;
  access_profile:{ step_free:boolean; ada_seating:boolean; quiet_room:boolean; strobe_policy:"none"|"warned"|"unrestricted"; interpreter:"on_request"|"never" } }
interface Event { id:string; artist:Artist; venue:Venue; start_at:string; doors_at:string|null; price_min:number|null; price_max:number|null; tm_url:string|null; image_url?:string|null; support?:string|null; room?:string|null; is_past:boolean }   // tm_url = primary seller's page
interface MediaFile { id:string; user:User; event:Event; kind:"image"|"video"; url:string; content_type:string; bytes:number; caption:string|null; taken_at:string|null; created_at:string }
interface ArtistHit { id:number; name:string; picture:string|null; fans:number }
interface EventCreateRequest { artist:string; venue:string; date:string; time?:string|null; support?:string|null }
interface TicketOffer { seller:string; kind:"primary"|"resale"; url:string; price_min:number|null; price_max:number|null; status:string|null; fetched_at:string }
interface Review { user_id:string; event_id:string; scores:Vec7; tags:string[]; price_paid:number|null }   // scores[6] = would_again ? 5 : 1
interface RankedShow { event:Event; theta:Vec7; score:number; tier:"S"|"A"|"B"|"C"; rank:number }
interface Ranking { user_id:string; weights:Vec7; shows:RankedShow[]; comparisons_done:number }
interface MatchCandidate { user:User; match_pct:number; shared_event_ids:string[]; explanation:string|null; icebreaker:string|null }
interface Crew { id:string; event:Event; members:User[]; messages:{user_id:string; text:string; at:string}[]; plan:Plan|null }
interface Plan { option:{event_id:string; tier_label:string; price:number}; meet_at:string; meet_where:string; per_member:{user_id:string; score:number; note:string}[]; compromise_note:string; summary:string }

// Discovery (search → event → save/attend/rank; search people → profile → follow)
type RecommendedEvent = Event & { friends_interested:User[]; reason:string; score:number }
type AttendanceStatus = "interested"|"going"|"attended"
interface PersonCard { user:User; match_pct:number; shows_count:number; following:boolean; follows_you:boolean }
interface UserProfile { user:User; following:boolean; follows_you:boolean; followers:number; following_count:number; match_pct:number|null; shows:RankedShow[]; upcoming:{event:Event; status:"interested"|"going"}[] }
```

## 6. API contracts & fixtures

Every endpoint below has `fixtures/<name>.json` with a realistic response for **Sam**. Frontend `api.ts` returns the fixture when `NEXT_PUBLIC_USE_FIXTURES=true` or when a per-endpoint override map says so. All endpoints take `?user=<id>` (no auth).

| Fixture | Method & path | Request body | Response |
|---|---|---|---|
| `users.json` | `GET /users` | — | `User[]` |
| `review_post.json` | `POST /reviews?user=` | `Review` (without user_id) | `{ok:true, next_compare:{event_a:Event,event_b:Event}}` |
| `compare_next.json` | `GET /compare/next?user=` | — | `{event_a:Event, event_b:Event, question:string}` or `null` if <2 reviewed |
| `compare_post.json` | `POST /compare?user=` | `{event_a,event_b,winner}` | `Ranking` |
| `rank.json` | `GET /rank?user=` | — | `Ranking` |
| `events_upcoming.json` | `GET /events?upcoming=true&user=` | — | `(Event & {friends_interested:User[]})[]` |
| `event_detail.json` | `GET /events/{id}?user=` | — | `{event:Event, friends_interested:User[], attendance:string\|null}` |
| `matches_locked.json` | `GET /matches/{event_id}?user=` (unverified) | — | **HTTP 403** `{error:"verification_required"}` |
| `matches.json` | same, verified | — | `MatchCandidate[]` (sorted desc, max 5) |
| `verify_start.json` | `POST /verify/start?user=` | — | `{session_id, url:"/verify/mock/{session_id}"}` |
| — | `POST /verify/webhook` | `{session_id, status:"verified"}` | `{ok:true}` — sets `users.verified=1` |
| `crew_create.json` | `POST /crews?user=` | `{event_id, member_ids}` | `Crew` |
| `crew_message.json` | `POST /crews/{id}/messages?user=` | `{text}` | `Crew` |
| `crew_plan.json` | `POST /crews/{id}/plan?user=` | — | `Crew` with `plan` filled |
| `events_search.json` | `GET /events?q=&limit=&user=` | — | `(Event & {friends_interested:User[]})[]` — artist/venue/genre search across past + upcoming, upcoming first |
| `events_recommended.json` | `GET /events/recommended?limit=5&user=` | — | `RecommendedEvent[]` — "For you": friends going × taste match + fans like you + artists/venues you've been to (`ml/recommend.py`) |
| `attendance_set.json` | `POST /attendance?user=` | `{event_id, status:AttendanceStatus\|null}` | `{event_id, status}` — want to go / going / went (went adds a provisional review); null clears |
| `unranked.json` | `GET /attendance/unranked?user=` | — | `Event[]` — went but never reviewed (provisional review only); drives the "Rank it now" prompt |
| `people.json` | `GET /people?q=&user=` | — | `PersonCard[]` — every other member, best taste match first |
| `user_profile.json` | `GET /users/{id}?user=` | — | `UserProfile` |
| `follows.json` | `POST /follows?user=` | `{user_id, follow:boolean}` | `{following:string[]}` |
| `media_upload.json` | `POST /media/upload?user=&event=&name=&caption=` | raw file bytes, `Content-Type` = file type (jpeg/png/webp/heic/gif/mp4/mov/webm, ≤ 80 MB) | `MediaFile` — stored via `app/storage.py` (local disk by default, Supabase Storage with env) |
| `media.json` | `GET /media?user=&event=` / `GET /media?user=&of=` | — | `MediaFile[]` — a show's media from you + people you follow / a member's media (empty unless you follow them) |
| `media_feed.json` | `GET /media/feed?user=` | — | `MediaFile[]` — latest from people you follow ("Friends' moments") |
| — | `DELETE /media/{id}?user=` | — | `{ok:true}` (owner only); `GET /media-files/{path}` serves local-storage files |
| `event_create.json` | `POST /events?user=` | `EventCreateRequest` | `Event` — user-added show (`source='user'`); artist name/picture/related from Deezer, unknown venues geocoded via Nominatim; same artist+venue+night returns the existing show |
| `artist_search.json` | `GET /artists/search?q=` | — | `ArtistHit[]` — Deezer artist autocomplete for the add-a-show form |
| `tickets.json` | `GET /events/{id}/tickets?user=` | — | `TicketOffer[]` — official seller(s) from the venue scrape + resale; prices filled by Ticketmaster Discovery / SeatGeek when keys are set (`api/app/tickets.py`, 4 s timeout, cached 6 h) |

**Gate rule (M4, middleware):** `GET /matches/*`, `POST /crews` where any `member_ids` is not a direct follow of the caller, and `POST /crews/{id}/messages` where the crew has a non-follow → 403 `verification_required` unless `users.verified = 1`.

**`compare_next.question`** format: `"Better or worse than {event_b.artist.name} at {event_b.venue.name}?"`

## 7. Deterministic demo data

### 7.1 Venues (`seed/venues.json`) — hand-written, verify coordinates on a map before seeding
| id | name | lat | lng | radius_m | multi_room | notes |
|---|---|---|---|---|---|---|
| `tabernacle` | Tabernacle | 33.7586 | -84.3913 | 120 | 0 | step_free ✔, ada ✔, quiet ✘, strobe warned |
| `eastern` | The Eastern | 33.7524 | -84.3648 | 150 | 0 | step_free ✔, ada ✔, quiet ✔, strobe warned |
| `variety` | Variety Playhouse | 33.7649 | -84.3492 | 100 | 0 | step_free ✔, ada ✔, quiet ✘, strobe unrestricted |
| `terminal_west` | Terminal West | 33.7830 | -84.4108 | 120 | 0 | step_free ✘, ada ✘, quiet ✘ |
| `state_farm` | State Farm Arena | 33.7573 | -84.3963 | 300 | 0 | all ✔, interpreter on_request |
| `roxy` | Coca-Cola Roxy | 33.8898 | -84.4686 | 200 | 0 | step_free ✔, ada ✔ |
| `masquerade` | The Masquerade | 33.7522 | -84.3915 | 120 | **1** | step_free ✘, ada partial → `ada_seating:false` |

### 7.2 Sam's shows (`seed/demo_events.json`)
Artist names below are placeholders; `seed.swap_placeholders` replaces them with a real show at that venue on that night (d01–d06) or within ±3 days (d07–d12) when the archive replay has one.

Logged during the demo (6 — the user searches each on "Log a show" and taps "I went"):
| event_id | venue | start_at | artist (placeholder) |
|---|---|---|---|
| `d01` | tabernacle | 2025-10-11T20:00 | Night Harbor |
| `d02` | eastern | 2025-11-22T20:00 | Velvet Static |
| `d03` | variety | 2026-01-17T20:00 | Copper Moons |
| `d04` | state_farm | 2026-02-28T19:30 | Aurora Fields |
| `d05` | terminal_west | 2026-04-04T20:00 | Glass Parade |
| `d06` | roxy | 2026-06-13T20:00 | The Low Tides |

Pre-existing manual attendances with reviews (6): `d07`–`d12` across the same venues, dates in 2025. Sam's reviews are **Production-heavy**: production scores 4–5, crowd 2–3, others 3–4. Two of them have `production=5, venue=2` (great show, bad room) so the radar cards tell the story.

Target upcoming event: **`t01`** — the highest-priced real Ticketmaster event at `eastern` or `tabernacle` in the next 60 days (M1 picks and pins the id in `demo_events.json`). Maya and Jordan are `interested` in it.

### 7.3 Users (`seed/demo_users.json`)
- **`sam`** — Artem Kim. `verified=0`. `budget_max=90`. `needs=[]`. Follows: `priya`, `dev`, `lena` (3 friends). Persona: production-lover.
- **`maya`** — Maya Chen. `verified=1`. Follows `priya` (so she's 2 hops from Sam). Shares `d02, d04, d07, d09` with Sam, ranks them similarly → target match ≈ 84%. Persona: production-lover. `needs=["sensory"]` (this forces the plan to pick `eastern`, which has a quiet room).
- **`jordan`** — Jordan Reyes. `verified=1`. Follows `dev`. Shares `d01, d04, d11` → target ≈ 71%. Persona: music-first. `budget_max=75` (this becomes the binding budget constraint in the plan).
- **`priya`, `dev`, `lena`** — Jasmine Liu, Satvik Prasad, Ayush Shah: the demo user's direct friends, verified, mixed personas, a few shared shows each.
- **27 synthetic** — generated by `personas.py` with `random.seed(1313)`: 6 personas × ~4–5 users, 8–25 attendances each from the Setlist.fm past events, reviews sampled around persona means (σ = 0.7, clipped to 1–5), 3–8 follows each forming a connected graph.

**Verify at seed time (assert in `seed.py`):** `taste.match("sam","maya") ∈ [80, 88]` and `taste.match("sam","jordan") ∈ [66, 76]` after the demo user marks d01–d06 as "went" (each gets a provisional review). If not, nudge Maya's/Jordan's review scores until they are.

### 7.4 Demo photos
Photo-based show detection was removed (it could not identify shows reliably); logging is search → "I went", or "Add the show". `demo_photos/` holds the team's own photos and videos; `seed/demo_media.json` maps each to a person and a show (adding the out-of-town shows — BTS at MetLife, a festival at SeatGeek Stadium — as user-added shows with Deezer pictures) and `make seed` copies them to `data/media/seed/`.

### 7.5 `demo_reset.py`
Deletes Sam's `d01–d06` attendances/reviews/media_items and comparisons, sets `verified=0`, resets Sam's `weights` to uniform, deletes any crew containing Sam. Run before every run-through and before recording.

## 8. Known-fragile spots

- **Ticketmaster Discovery:** 5 req/s, 5000/day. `fetch_ticketmaster.py` writes every raw response to `data/cache/ticketmaster/` and reads from cache if present. Query: `classificationName=music&city=Atlanta&stateCode=GA&size=200&sort=date,asc`, paginate to ~150 events. Prices from `priceRanges[0]`, may be absent. Venue matching to our 7 by name-contains; everything else gets a venue row auto-created with `geofence_radius_m=150` and empty access profile.
- **Venue scrapers (`seed/fetch_venues.py`, no keys):** Tabernacle + Coca-Cola Roxy (Live Nation) publish schema.org `MusicEvent` JSON-LD on `/shows`; The Eastern, Terminal West and Variety Playhouse load a public AEG feed (`aegwebprod.blob.core.windows.net/json/events/{127,211,214}/events.json`) with AXS links, doors, support and posters; The Masquerade is WordPress event cards (`itemprop="startDate"` is the *doors* time; four rooms); State Farm Arena is an HTML list (games/community events filtered out). None publish prices or an archive. Raw pages are cached in `data/cache/venues/` (committed) so `make seed` is deterministic; delete the cache to refresh. Browser UA + 0.5 s between requests; a parse failure skips that venue, never breaks seeding.
- **Past shows (`fetch_venues.load_past`):** the Wayback Machine keeps monthly copies of the Tabernacle, Roxy, Masquerade and State Farm Arena calendars; replaying ~13 months of snapshots through the same parsers yields ~550 real past shows (only the normalized `data/cache/venues/past_shows.json` is cached — the raw snapshots would be 40 MB). The AEG feeds are not archived, so The Eastern / Terminal West / Variety keep synthetic filler until a `SETLISTFM_API_KEY` exists. Sam's placeholder shows (§7.2) are swapped for a real show at that venue on that night (photo shows) or within ±3 days (manual ones) by `seed.swap_placeholders`.
- **Genres & similar artists (`seed/fetch_music.py`, no keys):** MusicBrainz tags (1 req/s, ~2 s per artist, cached in `data/cache/music/artists.json`) fill `artists.genres`; Deezer's related-artists endpoint fills `artists.related`. `ml/recommend.py` uses both (genre Jaccard, "Similar to X, who you've seen").
- **Photos & videos (`api/app/routers/gallery.py`, `app/storage.py`):** uploads are one raw-body request per file (no multipart dependency). `MEDIA_STORAGE=local` keeps files in `data/media/` (gitignored; `make seed` recreates the friends' demo photos there) and serves them at `/media-files/…`; `MEDIA_STORAGE=supabase` + `SUPABASE_URL/SERVICE_KEY/BUCKET` puts them in a public Supabase bucket so every device shares them. Rows store the provider path/URL, never the host. HEIC/HEVC from iPhones is stored as-is; only Safari renders it.
- **Ticket prices (`api/app/tickets.py`):** Eventbrite pages carry face value in JSON-LD; Gametime search results carry resale lowest price + the event page (no keys). Ticketmaster and AXS event pages return 401/403 to servers, and StubHub/SeatGeek/Vivid need partner keys, so official Ticketmaster prices need `TICKETMASTER_API_KEY` and SeatGeek resale needs `SEATGEEK_CLIENT_ID`. Lookups run in parallel at request time with a 5 s cap and are cached 6 h in `ticket_offers`.
- **Setlist.fm:** requires API key (apply immediately), 2 req/s, header `x-api-key`, `Accept: application/json`. `GET /rest/1.0/search/setlists?venueName=...&p=N`. Backfill ~400 events across 7 venues takes 3–5 min; cache to `data/cache/setlistfm/`. Setlist.fm dates are `dd-MM-yyyy`; assume 20:00 local start.
- **Grok:** OpenAI-compatible chat completions; use `httpx` directly, no SDK. `temperature=0.4`, `max_tokens=300`. **Every AI call has a deterministic fallback** template string if the request fails or exceeds 6 s, so the demo never hangs.
- **Recharts radar** needs data as `[{dim:"Music", value:4}, ...]`; cap axis at 5.
- **CORS:** allow `http://localhost:3000` in `main.py` day one.

## 9. Definitions of done

| Owner | Task | Done when |
|---|---|---|
| M1 | Venues + schema | `sqlite3 data/encore.db .schema` matches §3; 7 venues present with correct access profiles |
| M1 | Ticketmaster pull | ≥120 upcoming Atlanta events in `events`, `is_past=0`, cache files committed; `t01` pinned |
| M1 | Setlist.fm backfill | ≥250 past events across the 7 venues, or a documented fallback (synthetic past events with `source='demo'`) if key not approved by 6 PM |
| M1 | `make seed` | Runs clean twice, `sha256sum data/encore.db` identical; assertions in §7.3 pass |
| M1 | `/events` endpoints | Real responses validate against `events_upcoming.json` / `event_detail.json` schemas |
| M2 | `ranker.py` | `pytest tests/test_ranker.py`: synthetic user with known true ordering of 10 shows recovers top-3 in correct order after ≤6 info-gain comparisons in ≥8/10 seeds; `weights` moves toward production for Sam after 3 comparisons |
| M2 | `/compare/*`, `/rank`, `/media/match`, `/reviews` | Real responses validate against fixtures' schemas; `compare/next` never returns the same pair twice for a user |
| M2 | `taste.py` | Sam–Maya and Sam–Jordan in target ranges; symmetric; verified filter applied |
| M2 | `group.py` | For crew {sam, maya, jordan} on `t01`: top option price ≤ 75 and venue satisfies `sensory`; returns 3 options with per-member scores |
| M3 | Log a show | Search a past show → "I went" → review in <90 s; a show the calendars lack can be added (artist autocomplete, venue, date) |
| M3 | Review + compare | Full flow for one show in <90 s with no dead ends; preference bars animate after each answer |
| M3 | Event page gate | Unverified Sam sees locked matches; after verify flow, same page shows 2 matches with explanation + icebreaker |
| M3 | Crew | Send 3 messages, "Make a plan" renders plan card, "Adopt" pins it |
| M3 | Phone frame | Renders at 390×844 inside a centered frame at 1920×1080 with no horizontal scroll |
| M4 | Skeleton | `make dev` starts both; `GET /users` returns Sam from real DB; CORS OK |
| M4 | Verify | `/verify/start` → mock page → auto-webhook after 3 s → `users.verified=1`; 403 gate proven by test |
| M4 | AI explain | For Sam–Maya on `t01`, output mentions at least one of the shared event artists and ≤ 2 sentences + icebreaker; fallback template fires on simulated timeout |
| M4 | AI plan | For the demo crew transcript in `fixtures/crew_plan.json`, plan names Maya's need and Jordan's budget; fallback fires on timeout |
| M4 | Submission | Devpost draft, Meta write-up, video uploaded, Notability screenshots in repo, expo.hexlabs.org submitted — all before 7:00 AM |

## 10. Demo run-through script (all four, from 2 AM)

1. `make demo-reset`. Laptop A: web at 1920×1080, API running. Laptop B: same + video.
2. Home as Artem → Log a show → search each of the six shows (or add one that's missing) → "I went".
3. Review `d04` (Aurora Fields, State Farm) → 3 compares → ranked list; point at preference bars.
4. Event page `t01` → locked → Verify → unlocked, Maya 84%, Jordan 71%.
5. Create crew with both → 3 scripted messages (from `submission/video_script.md`) → Make a plan → Adopt.
6. Total ≤ 4 minutes. Time it. Fix only what breaks.

---
---

# Task prompts

Each prompt is self-contained. Paste it into your agent along with `AGENTS.md` and `DESIGN.md`.

---

## M1 — Data & Event Graph

> You are Member 1 on a 4-person hackathon team building Encore. Read `AGENTS.md` fully, then `DESIGN.md` §5–7. You own `seed/`, `data/`, `demo_photos/`, and `api/app/routers/events.py`. Do not edit anything else; if you need a change elsewhere, write it down and stop.
>
> Work in this order and stop after each numbered step to report the definition-of-done check from `AGENTS.md` §9:
>
> 1. Write `seed/schema.sql` exactly as `AGENTS.md` §3. Write `seed/venues.json` from §7.1; before committing, sanity-check each coordinate lands on the venue in a map and adjust if not.
> 2. `seed/fetch_ticketmaster.py`: pull upcoming Atlanta music events per §8, cache raw JSON, normalize into artists/venues/events. Pick `t01` per §7.2 and write its id into `seed/demo_events.json`.
> 3. `seed/fetch_setlistfm.py`: backfill past events per §8. If `SETLISTFM_API_KEY` is empty or unapproved, implement the documented fallback (synthetic past events, `source='demo'`) and flag it. Where a real past show exists within ±3 days of a `d01–d06` placeholder at that venue, swap the placeholder's artist and date in and note the change.
> 4. `seed/personas.py` and `seed/demo_users.json` per §7.3, then `seed/seed.py` that builds `data/encore.db` from scratch with `random.seed(1313)`, including the taste-match assertions. Import `api/app/ml/taste.py` for the assertion; if M2 hasn't shipped it, stub the assertion with a TODO and tell M2.
> 5. `demo_photos/make_photos.sh` per §7.4 (12 photos + 2 decoys) and `seed/demo_reset.py` per §7.5. Wire `make seed` and `make demo-reset`.
> 6. `api/app/routers/events.py`: `GET /events?upcoming=true` and `GET /events/{id}` per §6, responses validating against `fixtures/events_upcoming.json` and `fixtures/event_detail.json`.
>
> Constraints: SQLite only, no ORM, dependencies only from `AGENTS.md` §2. Deterministic output is non-negotiable — run `make seed` twice and compare hashes before reporting step 4 done. Deadline for step 4: 7:00 PM. Feature freeze 2:00 AM.

---

## M2 — Ranking, Matching & ML

> You are Member 2 on a 4-person hackathon team building Encore. Read `AGENTS.md` fully, then `DESIGN.md` §7. You own `api/app/ml/`, `api/app/routers/{media,reviews,compare,rank}.py`, the scoring half of `routers/matches.py`, and `api/tests/`. Do not edit `schemas.py` without updating `web/src/types.ts` and the fixtures and announcing it.
>
> Until M1's `data/encore.db` exists, develop against a tiny in-memory fixture DB you build in `tests/conftest.py` from `seed/schema.sql`.
>
> Work in this order; stop after each step and report its §9 check:
>
> 1. `ml/matcher.py`: pure function `match(items, venues, events) -> list[MediaMatch]` implementing `DESIGN.md` §7.1 exactly (haversine geofence, time window, multi-room prior 0.6, per-night clustering, noisy-OR aggregation, thresholds 0.8/0.4). Write `tests/test_matcher.py` using the coordinates and timestamps in `AGENTS.md` §7.2/§7.4 as literal test data — don't wait for the real photos.
> 2. `ml/ranker.py`: multi-dimensional Bradley-Terry per §7.2 with constants from `AGENTS.md` §4. Functions: `init_theta(review) -> Vec7`, `update(weights, theta_a, var_a, theta_b, var_b, winner)`, `next_pair(user_state) -> (a, b)` using the information-gain criterion, `ranking(user_state) -> Ranking` with tiers per §4. Write `tests/test_ranker.py` with a synthetic user whose true ordering is known; the check is in §9.
> 3. Routers `POST /media/match`, `POST /reviews`, `GET /compare/next`, `POST /compare`, `GET /rank` per §6, reading/writing `reviews.theta`, `reviews.theta_var`, `users.weights`, `comparisons`. `compare/next` must exclude already-asked pairs. Validate each real response against the corresponding fixture's shape.
> 4. `ml/taste.py`: `match(user_a, user_b) -> int` per §7.3. Candidate retrieval for an event: users within 2 follow hops of the caller, `interested|going` on the event, `verified=1`, excluding the caller. Export `candidates(user, event_id) -> list[MatchCandidate]` with `explanation=None, icebreaker=None` — M4 fills those. Tell M1 when this exists so seed assertions can use it.
> 5. `ml/group.py`: `score_options(crew_member_ids, event_id) -> list[option]` per §7.4 with constraint rules from `AGENTS.md` §3. Options = the event × three price tiers between `price_min` and `price_max` (or a single tier if prices missing). Export per-member scores; M4 turns them into prose.
>
> All ML is NumPy/SciPy only. Every function must run in <50 ms on the seed DB. Deadline for step 3: 7:00 PM. Feature freeze 2:00 AM.

---

## M3 — Frontend

> You are Member 3 on a 4-person hackathon team building Encore. Read `AGENTS.md` fully, then `DESIGN.md` §6 and §10. You own `web/` entirely. Build against `fixtures/` from minute one via `NEXT_PUBLIC_USE_FIXTURES=true`; flip individual endpoints to the real API in `src/lib/api.ts` as teammates announce them green.
>
> Layout rule: everything renders inside a fixed 390×844 phone frame centered on the viewport, dark theme, no horizontal scroll at 1920×1080. Recharts for the radar card and the preference bars. Tailwind only, no component libraries.
>
> Build screens in this order; stop after each and confirm it works on fixtures:
>
> 1. `/` Home: user switcher (from `GET /users`, default Sam), "Import from camera roll," "Log a show," friends feed (from `events_upcoming.json` `friends_interested`).
> 2. `/import`: multi-file input (`accept="image/*"`), run `exifr` per `AGENTS.md` §8 client-side, show per-file progress, POST only `{lat,lng,captured_at}` to `/media/match`, render `MediaMatch[]` as cards with confidence chip and `suggested` state (auto → pre-checked, ask → unchecked with "Were you at…?"), confirm → `/attendance/confirm`. Show a one-line "Photos never leave your device" note.
> 3. `/review/[eventId]`: seven screens, one per dimension in `DIMS` order, 1–5 tap + tag chips from `TAGS`, final screen would-attend-again + price paid, then POST `/reviews` and route to compare.
> 4. `/compare`: render `question`, two event cards, tap picks winner, POST `/compare`, repeat 3 times, then route to `/rank`. Animate the preference bars from the returned `Ranking.weights` between questions.
> 5. `/rank`: tiers S/A/B/C, tap a show → radar card of `theta`, preference bars at top labelled "What you care about."
> 6. `/events/[id]`: artist, venue with Access panel from `access_profile`, price range, friends interested. Matches section: on 403 `verification_required` render locked state with "Verify to see who's going" → `/verify`. On 200 render `MatchCandidate[]` with match %, explanation, icebreaker, verified badge, and "Start a crew" (multi-select).
> 7. `/verify`: call `/verify/start`, open the returned mock `url` in-frame, on completion route back to the event page (the mock page calls the webhook itself). Make the locked → unlocked transition visible.
> 8. `/crews/[id]`: members, chat list, input, "Make a plan" → POST `/plan` → render `Plan` card (summary, meet_at/where, per_member notes, compromise_note) with "Adopt."
>
> Definitions of done are in `AGENTS.md` §9. Deadline for screens 1–4: 7:00 PM; 5–6: 10 PM; 7–8: 1 AM. Feature freeze 2:00 AM; after that only fix what breaks the run-through in §10.

---

## M4 — Skeleton, AI, Trust & Submission

> You are Member 4 on a 4-person hackathon team building Encore. Read `AGENTS.md` fully, then `DESIGN.md` §8–9 and §13–16. You own the API skeleton (`api/app/main.py`, `db.py`, `schemas.py`, `constants.py`), `api/app/ai/`, `api/app/verify/`, `routers/{verify,crews}.py`, the explanation half of `routers/matches.py` plus the gate middleware, `fixtures/`, and `submission/`. You are also the integrator: you keep `schemas.py` ↔ `web/src/types.ts` in sync and announce any change.
>
> Work in this order; stop after each step and report its §9 check:
>
> 1. **By 3:00 PM:** repo skeleton per `AGENTS.md` §1, `Makefile`, `.env.example`, `schemas.py` and `constants.py` exactly per §4–5, `main.py` with CORS and router includes (routers can be empty stubs returning fixtures), and **every fixture file in §6** with realistic Sam data consistent with §7. This unblocks everyone; nothing else you do matters until this ships.
> 2. `verify/provider.py` (interface) and `verify/mock.py`; `routers/verify.py` with `/verify/start`, a served mock HTML page at `/verify/mock/{session_id}` that shows an ID-scan/selfie UI and after 3 s POSTs `/verify/webhook` then redirects to `?returnTo`; webhook sets `users.verified=1`. Gate middleware per §6 with `tests/test_gate.py` proving the 403.
> 3. `ai/grok.py`: OpenAI-compatible chat client with `httpx`, 6 s timeout, and a `fallback` argument; `ai/prompts.py` with the two prompts from `DESIGN.md` §8 including the "cite only shows in the input" constraint. `ai/explain.py`: takes a `MatchCandidate` + shared shows + both users' weights, returns `(explanation, icebreaker)`; wire into `routers/matches.py` after M2's `candidates()`. Fallback template: `"You both rated {artist} highly and care most about {dim}. Ask them what they thought of the {tag} at {venue}."`
> 4. `routers/crews.py` and `ai/plan.py`: create/message per §6; `/plan` calls M2's `group.score_options`, passes transcript + constraints + options to Grok, returns a `Plan`. Fallback: pick the top option, fill `per_member` from scores, `compromise_note` from the binding budget/need.
> 5. **Submission**, in parallel from 7 PM: `submission/devpost.md` and `meta.md` from `DESIGN.md` §14–15 (adjust to what actually shipped); `video_script.md` following §10's run-through with three scripted crew messages that mention seats, budget, and "somewhere less loud"; Notability planning note + 2 screenshots into `submission/notability/`; README with setup, architecture diagram, team, and an explicit "verification is mocked; production: Stripe Identity or Persona" line.
> 6. **3–5 AM:** record the 2–3 min video from Laptop B after `make demo-reset`, upload unlisted, put the link in `devpost.md`. **By 7:00 AM:** Devpost submitted with track Oracle of the Deep and challenges Meta / SpaceXAI / Notability, "Built with" includes Notability, Create-X box checked, Devpost link submitted at expo.hexlabs.org. Confirm in the team channel with the URLs.
>
> Do not integrate a real KYC vendor. Do not let any AI call block the UI — fallbacks always. Feature freeze 2:00 AM.
