"""Build data/encore.db from scratch, deterministically (AGENTS.md §7). Entry: python -m seed.seed

Sources, in order of preference:
  upcoming events: Ticketmaster cache/API, else synthetic (source='demo')
  past events:     Setlist.fm cache/API, else synthetic (source='demo')  ← documented fallback
  demo data:       seed/venues.json, seed/demo_events.json, seed/demo_users.json
"""
import json
import random
import re
import sqlite3
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from . import ROOT, fetch_setlistfm, fetch_ticketmaster
from .personas import PERSONAS, sample_scores, sample_tags

from app.constants import RANKER, UNIFORM_WEIGHTS  # noqa: E402  (path set in seed/__init__.py)
from app.ml import taste  # noqa: E402
from app.routers.reviews import add_provisional_review  # noqa: E402

SEED = 1313
DB = ROOT / "data" / "encore.db"
SEED_DIR = ROOT / "seed"
TZ = ZoneInfo("America/New_York")
TODAY = date(2026, 9, 26)          # fixed "now" so the build never depends on the clock
PAST_START = date(2024, 9, 27)
TARGET_WINDOW_DAYS = 60
VERIFIED_AT = "2026-09-01T12:00:00+00:00"
PHOTO_SHOWS = ["d01", "d02", "d03", "d04", "d05", "d06"]

EXTRA_VENUES = [  # stand-ins for venues Ticketmaster returns beyond our 7 (empty access profile)
    {"id": "fox_theatre", "name": "Fox Theatre", "lat": 33.7726, "lng": -84.3856},
    {"id": "center_stage", "name": "Center Stage", "lat": 33.7907, "lng": -84.3880},
    {"id": "buckhead_theatre", "name": "Buckhead Theatre", "lat": 33.8402, "lng": -84.3796},
]
SYNTH_ARTISTS = [
    ("Amber Coast", "indie rock"), ("Blue Relic", "alt rock"), ("Cinder Youth", "punk"), ("Dune Society", "psych rock"),
    ("Echo Parlor", "synth-pop"), ("Fable Motors", "indie pop"), ("Gold Static", "electronic"),
    ("Honey Arcade", "pop"), ("Iron Lanterns", "metal"), ("Juniper Hall", "folk"), ("Kestrel Line", "americana"),
    ("Lotus Radio", "r&b"), ("Marble Ghosts", "shoegaze"), ("North Parade", "indie rock"), ("Opal Engine", "electronic"),
    ("Pine Theory", "folk rock"), ("Quartz Hearts", "pop"), ("Rust Belt Choir", "americana"), ("Saffron Kid", "hip hop"),
    ("Tin Horizon", "post-punk"), ("Umber Waves", "dream pop"), ("Vapor Hollow", "synthwave"),
    ("Wild Signal", "alt rock"), ("Yellow Transit", "indie pop"), ("Zero Canyon", "metal"), ("Atlas Bloom", "electronic"),
    ("Brass Monarch", "funk"), ("Coral Theory", "r&b"), ("Delta Ghost", "blues rock"), ("Ember Crown", "hip hop"),
]
PRICE_BANDS = {  # (low, high) ranges for synthetic prices by venue size
    "state_farm": ((55, 80), (140, 220)), "roxy": ((40, 55), (80, 110)), "fox_theatre": ((45, 65), (95, 150)),
}
DEFAULT_BAND = ((20, 40), (40, 95))


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def local_iso(d: date, hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ).isoformat(timespec="seconds")


def iso_minus(iso: str, minutes: int) -> str:
    t = datetime.fromisoformat(iso)
    return (t - timedelta(minutes=minutes)).astimezone(TZ).isoformat(timespec="seconds")


class Builder:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.rng = random.Random(SEED)
        self.artists: set[str] = set()
        self.venues: dict[str, dict] = {}

    # ---- rows ----------------------------------------------------------------
    def artist(self, aid: str, name: str, genres: list[str], tm_id=None):
        if aid not in self.artists:
            self.artists.add(aid)
            self.conn.execute("INSERT INTO artists (id, name, tm_id, genres) VALUES (?,?,?,?)",
                              (aid, name, tm_id, json.dumps(genres)))

    def venue(self, v: dict):
        self.venues[v["id"]] = v
        self.conn.execute(
            "INSERT INTO venues (id, name, tm_id, lat, lng, geofence_radius_m, multi_room, access_profile)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (v["id"], v["name"], v.get("tm_id"), v["lat"], v["lng"], v.get("geofence_radius_m", 150),
             int(v.get("multi_room", False)), json.dumps(v.get("access_profile", {}))))

    def event(self, eid, artist_id, venue_id, start_at, doors_at, pmin, pmax, url, is_past, source):
        self.conn.execute(
            "INSERT INTO events (id, artist_id, venue_id, start_at, doors_at, price_min, price_max, tm_url,"
            " is_past, source) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (eid, artist_id, venue_id, start_at, doors_at, pmin, pmax, url, int(is_past), source))

    def review(self, user_id, event_id, scores, tags, price_paid=None):
        s = [int(x) for x in scores]
        would_again = s[6] >= 3
        theta = [float(x) for x in s[:6]] + [5.0 if would_again else 1.0]
        self.conn.execute(
            "INSERT INTO reviews (user_id, event_id, music, crowd, venue, accessibility, production, value,"
            " would_again, tags, price_paid, theta, theta_var) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, event_id, *s[:6], int(would_again), json.dumps(tags), price_paid, json.dumps(theta),
             RANKER["prior_var"]))

    def attend(self, user_id, event_id, status="attended", evidence="manual", confidence=1.0):
        self.conn.execute("INSERT OR IGNORE INTO attendance (user_id, event_id, status, evidence, confidence)"
                          " VALUES (?,?,?,?,?)", (user_id, event_id, status, evidence, confidence))

    def price(self, venue_id: str) -> tuple[float, float]:
        (lo_a, lo_b), (hi_a, hi_b) = PRICE_BANDS.get(venue_id, DEFAULT_BAND)
        lo = float(self.rng.randint(lo_a, lo_b))
        return lo, float(max(lo + 5, self.rng.randint(hi_a, hi_b)))


# ---- sections -----------------------------------------------------------------

def build_venues(b: Builder):
    for v in json.loads((SEED_DIR / "venues.json").read_text()):
        b.venue(v)


def demo_event_rows(b: Builder, spec: dict) -> set[tuple[str, str]]:
    """Insert d01–d12, x01, t01. Returns the (venue, date) nights they occupy."""
    nights = set()
    for aid, a in spec["artists"].items():
        b.artist(aid, a["name"], a["genres"])
    for e in spec["events"]:
        d, hhmm = e["start"].split("T")
        start = local_iso(date.fromisoformat(d), hhmm)
        is_past = date.fromisoformat(d) < TODAY
        b.event(e["id"], e["artist"], e["venue"], start, iso_minus(start, 60), *e["price"], e.get("tm_url"),
                is_past, "demo")
        nights.add((e["venue"], d))
    return nights


def build_past(b: Builder, taken: set[tuple[str, str]]) -> list[str]:
    shows = fetch_setlistfm.load()
    if not shows:
        return build_past_synthetic(b, taken)
    ids = []
    for s in sorted(shows, key=lambda s: (s["date"], s["venue_id"], s["sf_id"])):
        if (s["venue_id"], s["date"]) in taken or not (PAST_START.isoformat() <= s["date"] < TODAY.isoformat()):
            continue
        taken.add((s["venue_id"], s["date"]))
        aid = slug(s["artist"]["name"])
        b.artist(aid, s["artist"]["name"], [])
        eid = f"sf_{s['sf_id']}"
        b.event(eid, aid, s["venue_id"], local_iso(date.fromisoformat(s["date"]), "20:00"), None, None, None, None,
                True, "setlistfm")
        ids.append(eid)
    print(f"past events: {len(ids)} from Setlist.fm")
    return ids


def build_past_synthetic(b: Builder, taken: set[tuple[str, str]]) -> list[str]:
    """Documented fallback (AGENTS.md §9 M1): synthetic past events, source='demo'."""
    for name, genre in SYNTH_ARTISTS:
        b.artist(slug(name), name, [genre])
    venue_ids = [v["id"] for v in json.loads((SEED_DIR / "venues.json").read_text())]
    days = (TODAY - PAST_START).days
    picks = []
    while len(picks) < 400:
        vid = b.rng.choice(venue_ids)
        d = PAST_START + timedelta(days=b.rng.randrange(days))
        if (vid, d.isoformat()) in taken:
            continue
        taken.add((vid, d.isoformat()))
        picks.append((d, vid, slug(b.rng.choice(SYNTH_ARTISTS)[0]), b.rng.choice(["19:30", "20:00", "20:00", "21:00"])))
    ids = []
    for n, (d, vid, aid, hhmm) in enumerate(sorted(picks), 1):
        start = local_iso(d, hhmm)
        eid = f"p{n:03d}"
        b.event(eid, aid, vid, start, iso_minus(start, 60), *b.price(vid), None, True, "demo")
        ids.append(eid)
    print(f"past events: {len(ids)} synthetic (no Setlist.fm key/cache — documented fallback)")
    return ids


def build_upcoming(b: Builder, spec: dict) -> list[str]:
    tm = fetch_ticketmaster.load()
    t01 = next(e for e in spec["events"] if e["id"] == "t01")
    ids = []
    if tm:
        ours = {v["name"].lower().removeprefix("the "): vid for vid, v in b.venues.items()}
        window_end = (TODAY + timedelta(days=TARGET_WINDOW_DAYS)).isoformat()
        best = None
        for e in sorted(tm, key=lambda e: (e["start_at"], e["tm_id"])):
            if e["start_at"][:10] < TODAY.isoformat():
                continue
            vname = e["venue"]["name"].lower()
            vid = next((v for k, v in ours.items() if k in vname), None)
            if vid is None:
                vid = slug(e["venue"]["name"])
                if vid not in b.venues and e["venue"]["lat"] is not None:
                    b.venue({"id": vid, "name": e["venue"]["name"], "tm_id": e["venue"]["tm_id"],
                             "lat": e["venue"]["lat"], "lng": e["venue"]["lng"]})
                if vid not in b.venues:
                    continue
            aid = slug(e["artist"]["name"])
            b.artist(aid, e["artist"]["name"], e["artist"]["genres"], e["artist"]["tm_id"])
            eid = f"tm_{e['tm_id']}"
            b.event(eid, aid, vid, e["start_at"], e["doors_at"], e["price_min"], e["price_max"], e["tm_url"],
                    False, "ticketmaster")
            ids.append(eid)
            if vid in ("eastern", "tabernacle") and e["start_at"][:10] <= window_end and e["price_max"]:
                if best is None or e["price_max"] > best[1]["price_max"]:
                    best = (eid, e, aid, vid)
        if best:  # pin t01 to the real show: same id, real details
            eid, e, aid, vid = best
            b.conn.execute("UPDATE events SET artist_id=?, venue_id=?, start_at=?, doors_at=?, price_min=?,"
                           " price_max=?, tm_url=?, source='ticketmaster' WHERE id='t01'",
                           (aid, vid, e["start_at"], e["doors_at"], e["price_min"], e["price_max"], e["tm_url"]))
            b.conn.execute("DELETE FROM events WHERE id = ?", (eid,))
            ids.remove(eid)
            print(f"t01 pinned to Ticketmaster {e['tm_id']}: {e['artist']['name']} at {e['venue']['name']}")
        print(f"upcoming events: {len(ids) + 1} from Ticketmaster")
        return ids

    for v in EXTRA_VENUES:
        b.venue(v)
    venue_ids = list(b.venues)
    window_end = TODAY + timedelta(days=TARGET_WINDOW_DAYS)
    picks, taken = [], {(t01["venue"], t01["start"][:10])}
    while len(picks) < 149:
        vid = b.rng.choice(venue_ids)
        d = TODAY + timedelta(days=1 + b.rng.randrange(95))
        if (vid, d.isoformat()) in taken:
            continue
        taken.add((vid, d.isoformat()))
        lo, hi = b.price(vid)
        if vid in ("eastern", "tabernacle") and d <= window_end:
            hi = min(hi, t01["price"][1] - 10)  # t01 stays the highest-priced target-window show
        picks.append((d, vid, slug(b.rng.choice(SYNTH_ARTISTS)[0]), b.rng.choice(["19:00", "19:30", "20:00", "21:00"]),
                      lo, hi))
    for n, (d, vid, aid, hhmm, lo, hi) in enumerate(sorted(picks), 1):
        start = local_iso(d, hhmm)
        eid = f"u{n:03d}"
        b.event(eid, aid, vid, start, iso_minus(start, 60), lo, hi,
                f"https://www.ticketmaster.com/search?q={aid}", False, "demo")
        ids.append(eid)
    print(f"upcoming events: {len(ids) + 1} synthetic (no Ticketmaster key/cache)")
    return ids


def build_users(b: Builder, spec: dict, past_ids: list[str], upcoming_ids: list[str]):
    rng = b.rng
    named = spec["users"]
    synthetic = spec["synthetic"]

    def insert_user(uid, name, avatar, budget, needs, verified, weights):
        b.conn.execute(
            "INSERT INTO users (id, name, avatar, budget_max, accessibility_needs, verified, verified_at, weights)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (uid, name, avatar, budget, json.dumps(needs), int(verified), VERIFIED_AT if verified else None,
             json.dumps(weights)))

    for u in named:
        weights = UNIFORM_WEIGHTS if u["id"] == "sam" else u.get("weights", PERSONAS[u["persona"]]["weights"])
        insert_user(u["id"], u["name"], u["avatar"], u["budget_max"], u["needs"], u["verified"], weights)
    for s in synthetic:
        budget = float(rng.choice([50, 60, 75, 90, 120, 150, None]) or 0) or None
        needs = [rng.choice(["mobility", "sensory", "hearing", "vision", "chronic", "neurodivergent"])] \
            if rng.random() < 0.2 else []
        insert_user(s["id"], s["name"], s["avatar"], budget, needs, s["verified"], PERSONAS[s["persona"]]["weights"])

    # Named users: the scripted shared shows, then a few random past shows for the others.
    for u in named:
        for eid, scores in u["reviews"].items():
            b.attend(u["id"], eid)
            b.review(u["id"], eid, scores, u.get("tags", {}).get(eid, []))
        for eid in rng.sample(past_ids, u.get("extra_past", 0)):
            b.attend(u["id"], eid)
            b.review(u["id"], eid, sample_scores(u["persona"], rng), sample_tags(u["persona"], rng))
        for eid in u["interested"]:
            b.attend(u["id"], eid, status="interested")
    # Synthetic users: 8–25 attended shows each, reviews around their persona.
    for s in synthetic:
        for eid in sorted(rng.sample(past_ids, rng.randint(8, 25))):
            b.attend(s["id"], eid)
            b.review(s["id"], eid, sample_scores(s["persona"], rng), sample_tags(s["persona"], rng))
        for eid in sorted(rng.sample(upcoming_ids, rng.randint(0, 3))):  # never t01: keeps the demo's 2 matches
            b.attend(s["id"], eid, status=rng.choice(["interested", "going"]))
    # Sam's friends are interested in a few upcoming shows so the home feed has content.
    for uid in ("priya", "dev", "lena"):
        for eid in sorted(rng.sample(upcoming_ids[:40], 4)):
            b.attend(uid, eid, status="interested")

    follows = set()
    for u in named:
        follows |= {(u["id"], f) for f in u["follows"]}
    syn_ids = [s["id"] for s in synthetic]
    for i, uid in enumerate(syn_ids):  # a chain keeps the synthetic graph connected; then 2–7 random follows
        if i:
            follows.add((uid, syn_ids[i - 1]))
        for f in rng.sample([x for x in syn_ids if x != uid], rng.randint(2, 7)):
            follows.add((uid, f))
    for uid in ("priya", "dev", "lena"):  # tie the synthetic graph to Sam's friends
        for f in rng.sample(syn_ids, 2):
            follows.add((uid, f))
    b.conn.executemany("INSERT INTO follows VALUES (?,?)", sorted(follows))


def assert_taste_targets(conn: sqlite3.Connection, spec: dict):
    """AGENTS.md §7.3: after Sam's 6 photo shows are added and reviewed with defaults (the provisional
    review POST /attendance/confirm creates), Sam–Maya ∈ [80, 88] and Sam–Jordan ∈ [66, 76].
    Checked inside a rolled-back savepoint."""
    conn.execute("SAVEPOINT taste_check")
    b = Builder(conn)
    for eid in PHOTO_SHOWS:
        b.attend("sam", eid, evidence="photo", confidence=0.95)
        add_provisional_review(conn, "sam", eid)
    maya, jordan = taste.match("sam", "maya", conn), taste.match("sam", "jordan", conn)
    assert taste.match("maya", "sam", conn) == maya, "taste.match must be symmetric"
    conn.execute("ROLLBACK TO taste_check")
    conn.execute("RELEASE taste_check")
    print(f"taste: sam–maya {maya}%, sam–jordan {jordan}%")
    assert 80 <= maya <= 88, f"sam–maya {maya} not in [80, 88]"
    assert 66 <= jordan <= 76, f"sam–jordan {jordan} not in [66, 76]"


def main():
    DB.parent.mkdir(parents=True, exist_ok=True)
    DB.unlink(missing_ok=True)
    conn = sqlite3.connect(DB)
    conn.executescript((SEED_DIR / "schema.sql").read_text())
    b = Builder(conn)
    events_spec = json.loads((SEED_DIR / "demo_events.json").read_text())
    users_spec = json.loads((SEED_DIR / "demo_users.json").read_text())

    build_venues(b)
    nights = demo_event_rows(b, events_spec)
    past_ids = build_past(b, nights)
    upcoming_ids = build_upcoming(b, events_spec)
    build_users(b, users_spec, past_ids, upcoming_ids)
    conn.commit()
    assert_taste_targets(conn, users_spec)
    conn.commit()
    conn.execute("VACUUM")
    conn.close()
    print(f"wrote {DB.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
