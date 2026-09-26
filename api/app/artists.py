"""Artist lookup for user-added shows: Deezer's public search (no key) gives the canonical name, a picture
and related artists; Nominatim (OpenStreetMap, no key) geocodes venues we don't know yet.
Both are called sparingly (when someone adds a show) and cached in-process."""
import re
import time
from functools import lru_cache
from typing import Optional

import httpx

TIMEOUT = 6.0
UA = {"User-Agent": "Encore/0.1 (HackGT demo; https://github.com/satvikprasad/encore)"}


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def search_artists(q: str, limit: int = 6) -> list[dict]:
    """[{id, name, picture, fans}] best matches first; [] when Deezer is unreachable."""
    q = q.strip()
    if len(q) < 2:
        return []
    try:
        r = httpx.get("https://api.deezer.com/search/artist", params={"q": q, "limit": limit}, timeout=TIMEOUT, headers=UA)
        hits = r.json().get("data", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []
    return [{"id": h["id"], "name": h["name"], "picture": h.get("picture_medium") or h.get("picture") or None,
             "fans": h.get("nb_fan", 0)} for h in hits]


def related_artists(artist_id: int, limit: int = 8) -> list[str]:
    """Names of Deezer's related artists for an artist id; [] when unreachable."""
    try:
        r = httpx.get(f"https://api.deezer.com/artist/{artist_id}/related", params={"limit": limit}, timeout=TIMEOUT, headers=UA)
        return [a["name"] for a in r.json().get("data", [])] if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []


@lru_cache(maxsize=512)
def artist_details(name: str) -> dict:
    """{name, picture, related} for the best Deezer match of `name` (exact name preferred), else just the name."""
    hits = search_artists(name, limit=3)
    hit = next((h for h in hits if _norm(h["name"]) == _norm(name)), hits[0] if hits else None)
    if not hit:
        return {"name": name.strip(), "picture": None, "related": []}
    return {"name": hit["name"], "picture": hit["picture"], "related": related_artists(hit["id"])}


_geocache: dict[str, Optional[tuple[float, float]]] = {}


def geocode(place: str, city: str = "Atlanta, GA") -> Optional[tuple[float, float]]:
    """(lat, lng) for a venue name near the city via Nominatim, or None. One request per second, cached."""
    key = _norm(f"{place}|{city}")
    if key in _geocache:
        return _geocache[key]
    result = None
    try:
        r = httpx.get("https://nominatim.openstreetmap.org/search",
                      params={"q": f"{place}, {city}", "format": "json", "limit": 1}, timeout=TIMEOUT, headers=UA)
        hits = r.json() if r.status_code == 200 else []
        if hits:
            result = (round(float(hits[0]["lat"]), 5), round(float(hits[0]["lon"]), 5))
    except (httpx.HTTPError, ValueError, KeyError):
        result = None
    _geocache[key] = result
    time.sleep(1.0)  # Nominatim's usage policy
    return result
