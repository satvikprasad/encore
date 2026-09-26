"""Real shows at the 7 demo venues, scraped from the venues' own websites — no API keys needed.

  tabernacle, roxy                  Live Nation sites: schema.org MusicEvent JSON-LD on /shows (next ~3 months)
  eastern, terminal_west, variety   AEG/AXS venues: the public JSON feed their calendars load from (complete)
  masquerade                        WordPress event cards on /events/ (rooms: Heaven, Hell, Purgatory, Altar)
  state_farm                        HTML event list on /events (games and community events skipped; sold-out
                                    cards have no ticket button and multi-night runs one card per run)

Past shows: none of the sites keep an archive, so `load_past()` replays the Wayback Machine's monthly
snapshots of the same pages through the same parsers and keeps what has since happened. That is slow
(dozens of archive fetches), so only the normalized result is cached: data/cache/venues/past_shows.json.

Upcoming pages are cached raw in data/cache/venues/ and read back from there when present, so seeding
is deterministic and offline once the cache is committed. Prices are not published by any of these
sources; app/tickets.py fills them from Eventbrite, Gametime, and (with keys) Ticketmaster / SeatGeek.
Run directly to (re)fetch upcoming shows: python -m seed.fetch_venues   (add --past for the archive)
"""
import hashlib
import html
import json
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import httpx

from . import ROOT

CACHE = ROOT / "data" / "cache" / "venues"
MANIFEST = CACHE / "manifest.json"
PAST_FILE = CACHE / "past_shows.json"
TZ = ZoneInfo("America/New_York")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
AEG = "https://aegwebprod.blob.core.windows.net/json/events/{}/events.json"

# venue_id -> (adapter, [(cache name, url), ...])
SOURCES: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "tabernacle": ("livenation", [("tabernacle_upcoming.html", "https://www.tabernacleatl.com/shows")]),
    "roxy": ("livenation", [("roxy_upcoming.html", "https://www.cocacolaroxy.com/shows")]),
    "eastern": ("aeg", [("eastern.json", AEG.format(127))]),
    "terminal_west": ("aeg", [("terminal_west.json", AEG.format(211))]),
    "variety": ("aeg", [("variety.json", AEG.format(214))]),
    "masquerade": ("masquerade", [("masquerade.html", "https://www.masqueradeatlanta.com/events/")]),
    "state_farm": ("sfa", [("state_farm.html", "https://www.statefarmarena.com/events")]),
}

STATUS = {
    "buy tickets": "on_sale", "get tickets": "on_sale", "free": "on_sale", "rsvp": "on_sale",
    "sold out": "sold_out", "cancelled": "cancelled", "canceled": "cancelled", "postponed": "postponed",
    "coming soon": "coming_soon", "eventscheduled": "on_sale", "eventrescheduled": "on_sale",
    "eventcancelled": "cancelled", "eventpostponed": "postponed", "eventmovedonline": "cancelled",
}
NOT_A_SHOW = re.compile(r"\bvs\.?\b|\bHawks\b|\bDream\b|Playoffs|Preseason|\bGame\b|Meal Pack|Registration|"
                        r"Sign[- ]Up|Graduation|Commencement|Monster Jam|Disney On Ice|WWE|Globetrotters|"
                        r"Supercross|Convention|Open Practice|Watch Party|Job Fair|Draft", re.I)


# ---- fetching + cache -----------------------------------------------------------

def _get(url: str, timeout: float = 25) -> Optional[str]:
    try:
        r = httpx.get(url, headers=HEADERS, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        return r.text
    except httpx.HTTPError as e:
        print(f"venues: {url} failed ({e}); skipped")
        return None


def _fetch(name: str, url: str) -> Optional[str]:
    path = CACHE / name
    if path.exists():
        return path.read_text()
    text = _get(url)
    if text is None:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    if not MANIFEST.exists():
        MANIFEST.write_text(json.dumps({"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}) + "\n")
    time.sleep(0.5)  # be polite: one page every half second
    return text


def fetched_at() -> str:
    """When the cache snapshot was taken (so seeded rows are byte-identical run to run)."""
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())["fetched_at"]
    return "2026-09-26T00:00:00+00:00"


# ---- normalisation helpers ------------------------------------------------------

def _clean(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def headliner(title: str) -> str:
    """'Weezer: The Gathering' → 'Weezer'; 'Hulvey - "Could Be Tonight" Tour' → 'Hulvey';
    'Freddie Gibbs w/ The Alchemist' → 'Freddie Gibbs'; 'SLANDER PRESENTS: Starbase' → 'SLANDER'."""
    t = _clean(title) or title
    t = re.sub(r"^an evening with\s+", "", t, flags=re.I)
    t = re.split(r"\s+[-–—|]\s+|:\s|\s+w/\s+|\s+(?:with|feat\.?|featuring|ft\.?)\s+", t, maxsplit=1, flags=re.I)[0]
    t = re.sub(r"\s+presents?$", "", t, flags=re.I)
    t = re.sub(r"\s*\((?:live|tour|18\+|21\+|all ages)[^)]*\)\s*$", "", t, flags=re.I)
    return t.strip(" \"'“”") or t


def _status(raw: Optional[str]) -> str:
    key = (raw or "").split("/")[-1].strip().lower()
    return STATUS.get(key, "on_sale")


def _iso(dt: datetime) -> str:
    return dt.astimezone(TZ).isoformat(timespec="seconds")


def _src_id(venue_id: str, key: str) -> str:
    return hashlib.sha1(f"{venue_id}|{key}".encode()).hexdigest()[:10]


def _row(venue_id, key, title, start: datetime, doors: Optional[datetime], url, status, image, support=None, room=None):
    return {
        "venue_id": venue_id,
        "src_id": _src_id(venue_id, key),
        "title": _clean(title) or "Untitled",
        "artist": headliner(title),
        "support": _clean(support),
        "room": _clean(room),
        "start_at": _iso(start),
        "doors_at": _iso(doors) if doors else None,
        "date": _iso(start)[:10],
        "ticket_url": url,
        "status": status,
        "image_url": image,
    }


# ---- adapters -------------------------------------------------------------------

def parse_livenation(venue_id: str, page: str) -> list[dict]:
    out = []
    for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            data = json.loads(blob)
        except ValueError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if not isinstance(item, dict) or item.get("@type") not in ("MusicEvent", "Event") or not item.get("startDate"):
                continue
            try:
                start = datetime.fromisoformat(item["startDate"])
            except ValueError:
                continue
            if start.tzinfo is None:
                start = start.replace(tzinfo=TZ)
            url = item.get("url")
            image = item.get("image")
            if isinstance(image, list):
                image = image[0] if image else None
            key = (re.search(r"/event/([0-9A-Za-z]+)", url or "") or [None, url or item["name"]])[1]
            out.append(_row(venue_id, key, item["name"], start, None, url, _status(item.get("eventStatus")), image))
    return out


def parse_aeg(venue_id: str, page: str) -> list[dict]:
    out = []
    for e in json.loads(page).get("events", []):
        iso = e.get("eventDateTimeISO")
        if not iso or not e.get("active", True):
            continue
        try:
            start = datetime.fromisoformat(iso)
        except ValueError:
            continue
        doors = None
        if e.get("doorDateTime"):
            try:
                doors = datetime.fromisoformat(e["doorDateTime"]).replace(tzinfo=start.tzinfo)
            except ValueError:
                pass
        title = (e.get("title") or {})
        ticketing = e.get("ticketing") or {}
        media = e.get("media") or {}
        image = None
        if isinstance(media, dict) and media:
            image = max(media.values(), key=lambda m: m.get("width", 0)).get("file_name")
        out.append(_row(venue_id, str(e.get("eventId")), title.get("headlinersText") or title.get("eventTitleText") or "",
                        start, doors, ticketing.get("url") or ticketing.get("eventUrl"), _status(ticketing.get("status")),
                        image, support=title.get("supportingText")))
    return out


def parse_masquerade(venue_id: str, page: str) -> list[dict]:
    out = []
    for card in page.split('<article class="event"')[1:]:
        def g(pattern):
            m = re.search(pattern, card, re.S)
            return m.group(1) if m else None
        when, title = g(r'itemprop="startDate" content="([^"]+)"'), g(r'class="eventHeader__title[^"]*"[^>]*>(.*?)</h2>')
        if not when or not title:
            continue
        try:
            doors = datetime.strptime(when.strip(), "%B %d, %Y %I:%M %p").replace(tzinfo=TZ)
        except ValueError:
            continue
        page_url = g(r'class="wrapperLink" href="([^"]+)"') or ""
        button = _clean(g(r'itemtype="http://schema.org/Offer"[^>]*>(.*?)</a>')) or ""
        tickets = g(r'itemtype="http://schema.org/Offer" href="([^"]+)"')
        if tickets and not tickets.startswith("http"):  # a few cards carry a bare tracking query
            tickets = None
        out.append(_row(venue_id, f"{page_url or title}|{doors.date()}", title, doors + timedelta(hours=1), doors,
                        tickets, _status(button),
                        g(r"background-image: url\('([^']+)'\)"), support=g(r'class="eventHeader__support[^"]*"[^>]*>(.*?)</h4>'),
                        room=g(r'class="js-listVenue">([^<]+)<')))
    return out


def _sfa_nights(label: str) -> list[date]:
    """'September 26 2026' → [Sep 26]; 'November 11 to November 12 2026' → [Nov 11, Nov 12]."""
    label = label.strip()
    m = re.match(r"(\w+) (\d+) to (\w+) (\d+) (\d{4})$", label)
    if m:
        first = datetime.strptime(f"{m[1]} {m[2]} {m[5]}", "%B %d %Y").date()
        last = datetime.strptime(f"{m[3]} {m[4]} {m[5]}", "%B %d %Y").date()
        return [first + timedelta(days=i) for i in range((last - first).days + 1)] if last >= first else [first]
    try:
        return [datetime.strptime(label, "%B %d %Y").date()]
    except ValueError:
        return []


def parse_sfa(venue_id: str, page: str) -> list[dict]:
    out, seen = [], set()
    for card in page.split('<div class="eventItem')[1:]:
        def g(pattern):
            m = re.search(pattern, card, re.S)
            return m.group(1) if m else None
        label, title = g(r'class="date" aria-label="([^"]+)"'), _clean(g(r'title="More Info">(.*?)</a>'))
        tagline = _clean(g(r'class="tagline">(.*?)</h4>'))
        if not label or not title or NOT_A_SHOW.search(f"{title} {tagline or ''}"):
            continue
        detail = g(r'href="(https://www\.statefarmarena\.com/events/detail/[^"]+)"')
        tickets = g(r'href="(https://www\.ticketmaster\.com/[^"]+)"')
        tickets = html.unescape(tickets) if tickets else None
        # No ticket button on the arena's card means the run is sold out (or not yet on sale);
        # the arena's own event page still links through, so keep the show.
        status = "on_sale" if tickets else "sold_out"
        url = tickets or detail
        start_txt = _clean(g(r'class="start">(.*?)</span>')) or "8:00 PM"
        try:
            at = datetime.strptime(start_txt, "%I:%M %p").time()
        except ValueError:
            at = datetime.strptime("8:00 PM", "%I:%M %p").time()
        support = None
        if tagline and re.search(r"(?i)\bwith ", tagline):
            support = re.sub(r"(?i)^.*?\bwith ", "", tagline)
        for night in _sfa_nights(label):
            start = datetime.combine(night, at).replace(tzinfo=TZ)
            if (title, start) in seen:  # the page renders every event twice (list + grid)
                continue
            seen.add((title, start))
            key = f"{(re.search(r'/event/([0-9A-Za-z]+)', tickets or '') or [None, detail or title])[1]}|{night}"
            out.append(_row(venue_id, key, title, start, None, url, status, g(r'<img src="([^"]+)"'), support=support))
    return out


PARSERS = {"livenation": parse_livenation, "aeg": parse_aeg, "masquerade": parse_masquerade, "sfa": parse_sfa}


def _dedupe_sorted(rows: list[dict], horizon: str) -> list[dict]:
    seen, out = set(), []
    for r in rows:
        if r["src_id"] not in seen and r["date"] <= horizon:
            seen.add(r["src_id"])
            out.append(r)
    out.sort(key=lambda r: (r["start_at"], r["venue_id"], r["src_id"]))
    return out


def load_upcoming() -> list[dict]:
    """Every show the venue sites list right now, sorted; [] when nothing is cached or reachable."""
    horizon = f"{int(fetched_at()[:4]) + 2}-01-01"  # feeds carry placeholder dates like 2083 for unannounced shows
    rows = []
    for venue_id, (adapter, pages) in SOURCES.items():
        for name, url in pages:
            page = _fetch(name, url)
            if page is None:
                continue
            try:
                rows += PARSERS[adapter](venue_id, page)
            except Exception as e:  # a site redesign must not break seeding
                print(f"venues: could not parse {name} ({e}); skipped")
    return _dedupe_sorted(rows, horizon)


# ---- past shows via the Wayback Machine -------------------------------------------

WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx"
ARCHIVED = {  # venue -> (adapter, live url); the AEG feeds are not archived, so the Zero Mile venues have no past
    "tabernacle": ("livenation", "https://www.tabernacleatl.com/shows"),
    "roxy": ("livenation", "https://www.cocacolaroxy.com/shows"),
    "masquerade": ("masquerade", "https://www.masqueradeatlanta.com/events/"),
    "state_farm": ("sfa", "https://www.statefarmarena.com/events"),
}


def _snapshots(url: str, start: str, end: str) -> list[str]:
    """One archived copy per month between start and end (YYYYMM)."""
    try:
        r = httpx.get(WAYBACK_CDX, timeout=60, params={
            "url": url.split("://", 1)[1].removeprefix("www."), "from": start, "to": end, "output": "json", "fl": "timestamp",
            "filter": "statuscode:200", "collapse": "timestamp:6", "limit": 60})
        r.raise_for_status()
        return [row[0] for row in r.json()[1:]] if r.text.strip() else []
    except (httpx.HTTPError, ValueError) as e:
        print(f"venues: wayback index for {url} failed ({e})")
        return []


def build_past(today: date, months: int = 13) -> list[dict]:
    """Replay monthly Wayback snapshots of the venue calendars and keep the shows that have happened."""
    start = (today.replace(day=1) - timedelta(days=31 * months)).strftime("%Y%m")
    rows = []
    for venue_id, (adapter, url) in ARCHIVED.items():
        stamps = _snapshots(url, start, today.strftime("%Y%m"))
        print(f"venues: {venue_id}: {len(stamps)} archived copies")
        for ts in stamps:
            page = _get(f"https://web.archive.org/web/{ts}id_/{url}", timeout=90)
            if page is None:
                continue
            try:
                rows += [r for r in PARSERS[adapter](venue_id, page) if r["date"] < today.isoformat()]
            except Exception as e:
                print(f"venues: could not parse {venue_id}@{ts} ({e})")
            time.sleep(1.0)
    return _dedupe_sorted(rows, today.isoformat())


def load_past(today: Optional[date] = None) -> list[dict]:
    """Past shows from the cached archive replay; builds it (slowly, from the Wayback Machine) when missing."""
    if PAST_FILE.exists():
        rows = json.loads(PAST_FILE.read_text())
        for r in rows:  # the cache stores raw titles; derive the headliner with the current rules
            r["artist"] = headliner(r["title"])
        return rows
    if today is None:
        today = date.fromisoformat(fetched_at()[:10])
    rows = build_past(today)
    if rows:
        CACHE.mkdir(parents=True, exist_ok=True)
        PAST_FILE.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
    return rows


def load() -> list[dict]:
    """Upcoming shows from the venue sites plus past shows from the archive replay, sorted, one row per show."""
    rows, seen = [], set()
    for r in load_upcoming() + load_past():  # a show in both (still listed, already happened) keeps the live copy
        if r["src_id"] not in seen:
            seen.add(r["src_id"])
            rows.append(r)
    rows.sort(key=lambda r: (r["start_at"], r["venue_id"], r["src_id"]))
    return rows


if __name__ == "__main__":
    rows = load_upcoming()
    if "--past" in sys.argv:
        PAST_FILE.unlink(missing_ok=True)
        rows += load_past()
    by_venue: dict[str, list[dict]] = {}
    for r in rows:
        by_venue.setdefault(r["venue_id"], []).append(r)
    for v, rs in by_venue.items():
        print(f"{v:14} {len(rs):4} shows  {rs[0]['date']} → {rs[-1]['date']}")
    print(f"{len(rows)} shows total (cache: {CACHE.relative_to(ROOT)}, snapshot {fetched_at()})")
