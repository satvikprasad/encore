"""Past shows at the 7 demo venues from Setlist.fm (AGENTS.md §8).

Raw pages are cached in data/cache/setlistfm/. Without an approved key and no cache, seed.py
falls back to synthetic past events (source='demo').
Run directly to (re)fetch: python -m seed.fetch_setlistfm
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

from . import ROOT

CACHE = ROOT / "data" / "cache" / "setlistfm"
URL = "https://api.setlist.fm/rest/1.0/search/setlists"
MAX_PAGES = 5  # 20 setlists per page → ≤100 per venue
SEARCH_NAMES = {
    "tabernacle": "Tabernacle", "eastern": "The Eastern", "variety": "Variety Playhouse",
    "terminal_west": "Terminal West", "state_farm": "State Farm Arena", "roxy": "Coca-Cola Roxy",
    "masquerade": "The Masquerade",
}


def _path(venue_id: str, page: int) -> Path:
    return CACHE / f"{venue_id}_p{page}.json"


def fetch_venue(venue_id: str, api_key: Optional[str]) -> list[dict]:
    pages = []
    for page in range(1, MAX_PAGES + 1):
        path = _path(venue_id, page)
        if path.exists():
            data = json.loads(path.read_text())
        elif api_key:
            r = httpx.get(URL, params={"venueName": SEARCH_NAMES[venue_id], "cityName": "Atlanta", "p": page},
                          headers={"x-api-key": api_key, "Accept": "application/json"}, timeout=20)
            if r.status_code == 404:  # past the last page
                break
            r.raise_for_status()
            data = r.json()
            CACHE.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, indent=1, sort_keys=True))
            time.sleep(0.6)  # 2 req/s
        else:
            break
        pages.append(data)
        if page * data.get("itemsPerPage", 20) >= data.get("total", 0):
            break
    return pages


def normalize(venue_id: str, pages: list[dict]) -> list[dict]:
    """[{sf_id, venue_id, artist:{name, mbid}, date: YYYY-MM-DD}] — start assumed 20:00 local."""
    out = []
    for page in pages:
        for s in page.get("setlist", []):
            date = datetime.strptime(s["eventDate"], "%d-%m-%Y").date().isoformat()
            out.append({"sf_id": s["id"], "venue_id": venue_id, "date": date,
                        "artist": {"name": s["artist"]["name"], "mbid": s["artist"].get("mbid")}})
    return out


def load() -> Optional[list[dict]]:
    load_dotenv(ROOT / ".env")
    key = os.environ.get("SETLISTFM_API_KEY", "").strip() or None
    shows = [s for v in SEARCH_NAMES for s in normalize(v, fetch_venue(v, key))]
    return shows or None


if __name__ == "__main__":
    shows = load()
    print(f"{len(shows)} past shows" if shows is not None else "no SETLISTFM_API_KEY and no cache")
