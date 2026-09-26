"""Upcoming Atlanta music events from the Ticketmaster Discovery API (AGENTS.md §8).

Every raw page is cached in data/cache/ticketmaster/ and read back from there when present,
so seeding is deterministic and offline once the cache is committed.
Run directly to (re)fetch: python -m seed.fetch_ticketmaster
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv

from . import ROOT

CACHE = ROOT / "data" / "cache" / "ticketmaster"
URL = "https://app.ticketmaster.com/discovery/v2/events.json"
TZ = ZoneInfo("America/New_York")
TARGET_EVENTS = 150
PAGE_SIZE = 200


def _page_path(page: int) -> Path:
    return CACHE / f"atlanta_music_p{page}.json"


def fetch_pages(api_key: Optional[str]) -> list[dict]:
    """Raw pages, from cache when present, otherwise from the API (≤5 req/s)."""
    pages, page = [], 0
    while True:
        path = _page_path(page)
        if path.exists():
            data = json.loads(path.read_text())
        elif api_key:
            r = httpx.get(URL, params={"apikey": api_key, "classificationName": "music", "city": "Atlanta",
                                       "stateCode": "GA", "size": PAGE_SIZE, "sort": "date,asc", "page": page},
                          timeout=20)
            r.raise_for_status()
            data = r.json()
            CACHE.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, indent=1, sort_keys=True))
            time.sleep(0.25)
        else:
            break
        pages.append(data)
        total_pages = data.get("page", {}).get("totalPages", 1)
        count = sum(len(p.get("_embedded", {}).get("events", [])) for p in pages)
        page += 1
        if page >= total_pages or count >= TARGET_EVENTS:
            break
    return pages


def normalize(pages: list[dict]) -> list[dict]:
    """[{tm_id, artist:{tm_id,name,genres}, venue:{tm_id,name,lat,lng}, start_at, doors_at, price_min, price_max, tm_url}]"""
    out, seen = [], set()
    for page in pages:
        for e in page.get("_embedded", {}).get("events", []):
            if e["id"] in seen:
                continue
            seen.add(e["id"])
            emb = e.get("_embedded", {})
            venues, attractions = emb.get("venues", []), emb.get("attractions", [])
            start = e.get("dates", {}).get("start", {})
            if not venues or not start.get("localDate"):
                continue
            v = venues[0]
            loc = v.get("location", {})
            if start.get("dateTime"):
                start_at = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00")).astimezone(TZ)
            else:
                local = f"{start['localDate']}T{start.get('localTime', '20:00:00')}"
                start_at = datetime.fromisoformat(local).replace(tzinfo=TZ)
            a = attractions[0] if attractions else {"id": None, "name": e["name"]}
            cls = (a.get("classifications") or e.get("classifications") or [{}])[0]
            genres = [g for g in (cls.get("genre", {}).get("name"), cls.get("subGenre", {}).get("name"))
                      if g and g != "Undefined"]
            price = (e.get("priceRanges") or [{}])[0]
            out.append({
                "tm_id": e["id"],
                "artist": {"tm_id": a.get("id"), "name": a["name"], "genres": genres},
                "venue": {"tm_id": v.get("id"), "name": v.get("name", "Unknown venue"),
                          "lat": float(loc["latitude"]) if loc.get("latitude") else None,
                          "lng": float(loc["longitude"]) if loc.get("longitude") else None},
                "start_at": start_at.isoformat(timespec="seconds"),
                "doors_at": None,
                "price_min": price.get("min"),
                "price_max": price.get("max"),
                "tm_url": e.get("url"),
            })
    return out


def load() -> Optional[list[dict]]:
    """Normalized events, or None when there is neither a cache nor an API key."""
    load_dotenv(ROOT / ".env")
    pages = fetch_pages(os.environ.get("TICKETMASTER_API_KEY", "").strip() or None)
    return normalize(pages) if pages else None


if __name__ == "__main__":
    events = load()
    print(f"{len(events)} events" if events is not None else "no TICKETMASTER_API_KEY and no cache")
