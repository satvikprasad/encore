"""Ticket offers: which sites sell a show and for how much.

Primary offers (the venue's own seller: Ticketmaster, AXS, Eventbrite, …) come from the venue scrape at seed
time. Prices are filled in lazily, in parallel, with short timeouts, and never block the page:
  - Eventbrite face value from the event page's JSON-LD (no key)
  - Gametime resale: lowest listing + the page for this exact show, from their search results (no key)
  - Ticketmaster face value via the Discovery API when TICKETMASTER_API_KEY is set
  - SeatGeek resale (lowest listing) when SEATGEEK_CLIENT_ID is set
AXS and StubHub publish nothing machine-readable without a partner account, so those stay link-only.
Results are written back to ticket_offers so each lookup happens once per TTL.
"""
import json
import os
import re
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional
from urllib.parse import quote_plus, urlparse
from zoneinfo import ZoneInfo

import httpx

TIMEOUT = 5.0
TTL = timedelta(hours=6)
TZ = ZoneInfo("America/New_York")
BROWSER = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"}
SELLERS = [
    ("ticketmaster.", "Ticketmaster"), ("livenation.", "Live Nation"), ("axs.com", "AXS"), ("eventbrite.", "Eventbrite"),
    ("etix.", "Etix"), ("dice.fm", "DICE"), ("seetickets.", "See Tickets"), ("tixr.", "Tixr"), ("ticketweb.", "TicketWeb"),
    ("seatgeek.", "SeatGeek"), ("stubhub.", "StubHub"), ("vividseats.", "Vivid Seats"), ("gametime.", "Gametime"),
    ("statefarmarena.", "State Farm Arena"),
]


def seller_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    for needle, name in SELLERS:
        if needle in host:
            return name
    return host.removeprefix("www.") or "Tickets"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _stale(fetched_at: str) -> bool:
    try:
        return datetime.now(timezone.utc) - datetime.fromisoformat(fetched_at) > TTL
    except ValueError:
        return True


def _upsert(conn: sqlite3.Connection, event_id: str, seller: str, kind: str, url: str,
            lo: Optional[float], hi: Optional[float], status: Optional[str]) -> None:
    now = _now()
    conn.execute(
        "INSERT INTO ticket_offers (event_id, seller, kind, url, price_min, price_max, status, fetched_at, checked_at)"
        " VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id, seller) DO UPDATE SET url = excluded.url,"
        " price_min = excluded.price_min, price_max = excluded.price_max, status = excluded.status,"
        " fetched_at = excluded.fetched_at, checked_at = excluded.checked_at",
        (event_id, seller, kind, url, lo, hi, status, now, now))


def _checked(conn: sqlite3.Connection, event_id: str, seller: str) -> None:
    """Record a lookup that found nothing, so it isn't repeated until the TTL passes."""
    conn.execute("UPDATE ticket_offers SET checked_at = ? WHERE event_id = ? AND seller = ?", (_now(), event_id, seller))


def _due(row: Optional[dict]) -> bool:
    """A lookup is due when the row was never price-checked or the last check is older than the TTL."""
    return row is None or not row.get("checked_at") or _stale(row["checked_at"])


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _same_show(event: dict, name: str, venue: Optional[str], when: Optional[str]) -> bool:
    """Loose match of a listing to our show: artist name contained, same local date, venue name overlaps."""
    artist = _norm(event["artist"]["name"])
    if artist not in _norm(name) or _norm(name).startswith("parking"):
        return False
    if when:
        try:
            t = datetime.fromisoformat(when.replace("Z", "+00:00"))
            local = (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).astimezone(TZ).date()
            if abs((local - datetime.fromisoformat(event["start_at"]).date()).days) > 1:
                return False
        except ValueError:
            pass
    if venue:
        ours = set(_norm(event["venue"]["name"]).split()) - {"the"}
        theirs = set(_norm(venue).split())
        if ours and not ours & theirs:
            return False
    return True


# ---- keyless sources ---------------------------------------------------------------

def _ld_events(page: str):
    for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            data = json.loads(blob)
        except ValueError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict) and item.get("@type") in ("Event", "MusicEvent"):
                yield item


def eventbrite_prices(url: str) -> Optional[tuple[float, float]]:
    """Face value from the Eventbrite event page's schema.org offers."""
    r = httpx.get(url, headers=BROWSER, timeout=TIMEOUT, follow_redirects=True)
    if r.status_code != 200:
        return None
    for item in _ld_events(r.text):
        offers = item.get("offers") or []
        offers = offers if isinstance(offers, list) else [offers]
        prices = [float(p) for o in offers for p in (o.get("lowPrice"), o.get("highPrice"), o.get("price")) if p not in (None, "")]
        if prices:
            return min(prices), max(prices)
    return None


def gametime_listing(event: dict) -> Optional[dict]:
    """Gametime's page for this exact show with its lowest resale price, from their search results."""
    q = quote_plus(f"{event['artist']['name']} atlanta")
    r = httpx.get(f"https://gametime.co/search?q={q}", headers=BROWSER, timeout=TIMEOUT, follow_redirects=True)
    if r.status_code != 200:
        return None
    for item in _ld_events(r.text):
        loc = item.get("location") or {}
        if not _same_show(event, item.get("name", ""), loc.get("name") if isinstance(loc, dict) else None, item.get("startDate")):
            continue
        offer = item.get("offers") or {}
        offer = offer[0] if isinstance(offer, list) and offer else offer
        lo = offer.get("lowPrice") or offer.get("price")
        return {"url": item.get("url") or offer.get("url"), "lo": float(lo) if lo else None, "hi": None}
    return None


# ---- keyed sources ------------------------------------------------------------------

def ticketmaster_prices(url: str, api_key: str) -> Optional[tuple[float, float]]:
    """Face-value price range for a Ticketmaster event page URL, or None."""
    m = re.search(r"/event/([0-9A-Za-z]+)", url)
    if not m:
        return None
    r = httpx.get(f"https://app.ticketmaster.com/discovery/v2/events/{m.group(1)}.json",
                  params={"apikey": api_key}, timeout=TIMEOUT)
    if r.status_code != 200:
        return None
    ranges = r.json().get("priceRanges") or []
    if not ranges or ranges[0].get("min") is None:
        return None
    return float(ranges[0]["min"]), float(ranges[0].get("max") or ranges[0]["min"])


def seatgeek_listing(event: dict, client_id: str) -> Optional[dict]:
    """SeatGeek's page for this show (with lowest resale price) by artist + date, or None."""
    day = event["start_at"][:10]
    r = httpx.get("https://api.seatgeek.com/2/events", timeout=TIMEOUT, params={
        "client_id": client_id, "q": event["artist"]["name"], "venue.city": "Atlanta",
        "datetime_local.gte": f"{day}T00:00:00", "datetime_local.lte": f"{day}T23:59:59", "per_page": 5})
    if r.status_code != 200:
        return None
    for e in r.json().get("events", []):
        stats = e.get("stats") or {}
        return {"url": e.get("url"), "lo": stats.get("lowest_price"), "hi": stats.get("highest_price"),
                "listings": stats.get("listing_count")}
    return None


# ---- orchestration ------------------------------------------------------------------

def _rows(conn: sqlite3.Connection, event_id: str) -> dict[str, dict]:
    return {r["seller"]: dict(r) for r in conn.execute(
        "SELECT seller, kind, url, price_min, price_max, status, fetched_at, checked_at FROM ticket_offers"
        " WHERE event_id = ?", (event_id,))}


def _jobs(conn: sqlite3.Connection, event: dict, rows: dict) -> list[tuple[str, Callable[[], None]]]:
    """Lookups worth running now: each returns a thunk that writes to ticket_offers."""
    tm_key = os.environ.get("TICKETMASTER_API_KEY", "").strip()
    sg_id = os.environ.get("SEATGEEK_CLIENT_ID", "").strip()
    jobs = []
    eb = rows.get("Eventbrite")
    if eb and eb["price_min"] is None and _due(eb):
        def run_eb():
            prices = eventbrite_prices(eb["url"])
            if prices:
                _upsert(conn, event["id"], "Eventbrite", "primary", eb["url"], *prices, eb["status"])
            else:
                _checked(conn, event["id"], "Eventbrite")
        jobs.append(("Eventbrite", run_eb))
    tm = rows.get("Ticketmaster")
    if tm_key and tm and tm["price_min"] is None and _due(tm):
        def run_tm():
            prices = ticketmaster_prices(tm["url"], tm_key)
            if prices:
                _upsert(conn, event["id"], "Ticketmaster", "primary", tm["url"], *prices, tm["status"])
            else:
                _checked(conn, event["id"], "Ticketmaster")
        jobs.append(("Ticketmaster", run_tm))
    if not event["is_past"]:
        gt = rows.get("Gametime")
        if _due(gt):
            def run_gt():
                hit = gametime_listing(event)
                if hit and hit["url"]:
                    _upsert(conn, event["id"], "Gametime", "resale", hit["url"], hit["lo"], hit["hi"], "resale")
                elif gt is None:  # remember the miss so we don't search again until the TTL passes
                    _upsert(conn, event["id"], "Gametime", "resale", "", None, None, "none")
                else:
                    _checked(conn, event["id"], "Gametime")
            jobs.append(("Gametime", run_gt))
        sg = rows.get("SeatGeek")
        if sg_id and _due(sg):
            def run_sg():
                hit = seatgeek_listing(event, sg_id)
                if hit and hit["url"]:
                    _upsert(conn, event["id"], "SeatGeek", "resale", hit["url"], hit["lo"], hit["hi"],
                            f"{hit['listings']} listings" if hit.get("listings") else "resale")
                elif sg is None:
                    _upsert(conn, event["id"], "SeatGeek", "resale", "", None, None, "none")
                else:
                    _checked(conn, event["id"], "SeatGeek")
            jobs.append(("SeatGeek", run_sg))
    return jobs


def offers(conn: sqlite3.Connection, event: dict) -> list[dict]:
    """Offers for the event: official sellers before resale, cheapest known price first within each.
    Runs the pending lookups in parallel (bounded by TIMEOUT) and caches what they find."""
    rows = _rows(conn, event["id"])
    if not rows and event.get("tm_url"):  # older rows (Ticketmaster pull / demo) only have the URL on the event
        _upsert(conn, event["id"], seller_from_url(event["tm_url"]), "primary", event["tm_url"],
                event.get("price_min"), event.get("price_max"), None)
        conn.commit()
        rows = _rows(conn, event["id"])

    jobs = _jobs(conn, event, rows)
    if jobs:
        results = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fn): name for name, fn in jobs}
            for f, name in futures.items():
                try:
                    f.result(timeout=TIMEOUT + 1)
                except Exception:  # a ticket site being slow or down never breaks the page
                    results[name] = "failed"
        conn.commit()
        rows = _rows(conn, event["id"])

    out = [{k: v for k, v in o.items() if k != "checked_at"} for o in rows.values() if o["url"]]  # misses have no url
    out.sort(key=lambda o: (o["kind"] != "primary", o["price_min"] is None, o["price_min"] or 0, o["seller"]))
    return out
