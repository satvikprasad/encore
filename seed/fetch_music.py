"""Genres and similar artists for every scraped artist — the data behind the "For you" genre and
similar-artist signals (api/app/ml/recommend.py). No keys:

  Deezer   public API: artist lookup, related artists (up to 8), the artist's main genre via their albums
  MusicBrainz  artist tags (richer genre labels), 1 request/second as their policy asks

Results are cached in data/cache/music/artists.json (one entry per artist name) and written incrementally,
so an interrupted run resumes where it stopped. Run directly to (re)fetch: python -m seed.fetch_music
"""
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import httpx

from . import ROOT

CACHE = ROOT / "data" / "cache" / "music"
FILE = CACHE / "artists.json"
DEEZER = "https://api.deezer.com"
MUSICBRAINZ = "https://musicbrainz.org/ws/2/artist/"
MB_HEADERS = {"User-Agent": "Encore/0.1 (HackGT demo; https://github.com/kapitar/encore)", "Accept": "application/json"}
SKIP_TAGS = {"seen live", "american", "usa", "british", "uk", "male vocalists", "female vocalists", "canadian",
             "atlanta", "georgia", "under 2000 listeners", "favorites", "favourite"}
MAX_GENRES = 4
MAX_RELATED = 8

_genre_names: dict[int, str] = {}


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def _deezer_genres() -> dict[int, str]:
    global _genre_names
    if not _genre_names:
        try:
            r = httpx.get(f"{DEEZER}/genre", timeout=15)
            _genre_names = {g["id"]: g["name"] for g in r.json().get("data", [])}
        except (httpx.HTTPError, ValueError):
            _genre_names = {}
    return _genre_names


def deezer(name: str) -> dict:
    """{'deezer_id', 'fans', 'picture', 'related': [...], 'genre': str|None} — empty dict when Deezer doesn't know them."""
    try:
        r = httpx.get(f"{DEEZER}/search/artist", params={"q": name, "limit": 8}, timeout=15)
        hits = r.json().get("data", [])
    except (httpx.HTTPError, ValueError):
        return {}
    exact = [h for h in hits if _norm(h["name"]) == _norm(name)]
    hit = max(exact, key=lambda h: h.get("nb_fan", 0)) if exact else (hits[0] if hits else None)
    if not hit:
        return {}
    out = {"deezer_id": hit["id"], "fans": hit.get("nb_fan", 0), "related": [], "genre": None,
           "picture": hit.get("picture_xl") or hit.get("picture_big") or hit.get("picture_medium") or None}
    try:
        rel = httpx.get(f"{DEEZER}/artist/{hit['id']}/related", params={"limit": MAX_RELATED}, timeout=15).json()
        out["related"] = [a["name"] for a in rel.get("data", [])][:MAX_RELATED]
        albums = httpx.get(f"{DEEZER}/artist/{hit['id']}/albums", params={"limit": 5}, timeout=15).json()
        ids = [a.get("genre_id") for a in albums.get("data", []) if a.get("genre_id", -1) not in (-1, None)]
        if ids:
            out["genre"] = _deezer_genres().get(max(set(ids), key=ids.count))
    except (httpx.HTTPError, ValueError):
        pass
    return out


def musicbrainz(name: str) -> list[str]:
    """Top genre tags MusicBrainz users gave the artist (empty for small acts)."""
    for attempt in range(3):
        try:
            r = httpx.get(MUSICBRAINZ, params={"query": f'artist:"{name}"', "fmt": "json", "limit": 3},
                          headers=MB_HEADERS, timeout=20)
            if r.status_code == 503:  # rate limited: back off and retry
                time.sleep(2.0 * (attempt + 1))
                continue
            r.raise_for_status()
            hits = r.json().get("artists", [])
        except (httpx.HTTPError, ValueError):
            return []
        hit = next((h for h in hits if _norm(h["name"]) == _norm(name) and h.get("score", 0) >= 90), None)
        if not hit:
            return []
        tags = sorted((t for t in hit.get("tags", []) if t.get("count", 0) > 0 and t["name"].lower() not in SKIP_TAGS),
                      key=lambda t: (-t["count"], t["name"]))
        return [t["name"].lower() for t in tags][:MAX_GENRES + 2]
    return []


def _read() -> dict:
    return json.loads(FILE.read_text()) if FILE.exists() else {}


def _write(data: dict) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(dict(sorted(data.items())), indent=1, ensure_ascii=False) + "\n")


def load(names: list[str], fetch_missing: bool = True) -> dict[str, dict]:
    """{artist name: {genres: [...], related: [...], fans: int}} for the given names, fetching the ones not
    yet cached (≈2 s per artist: MusicBrainz's rate limit dominates)."""
    data = _read()
    # Entries cached before pictures were kept get a Deezer-only refresh (no MusicBrainz call).
    stale = [n for n in dict.fromkeys(names) if n in data and "picture" not in data[n]] if fetch_missing else []
    for i, name in enumerate(stale, 1):
        dz = deezer(name)
        data[name]["picture"] = dz.get("picture")
        if dz.get("related") and not data[name].get("related"):
            data[name]["related"] = dz["related"]
        if i % 20 == 0 or i == len(stale):
            _write(data)
            print(f"music: pictures {i}/{len(stale)}")
        time.sleep(0.25)
    missing = [n for n in dict.fromkeys(names) if n not in data]
    if missing and fetch_missing:
        print(f"music: fetching {len(missing)} artists (~{len(missing) * 2 // 60} min)")
        for i, name in enumerate(missing, 1):
            dz = deezer(name)
            tags = musicbrainz(name)
            genres = [t for t in tags if t not in SKIP_TAGS][:MAX_GENRES]
            if not genres and dz.get("genre"):
                genres = [dz["genre"].lower()]
            data[name] = {"genres": genres, "related": dz.get("related", []), "fans": dz.get("fans", 0),
                          "picture": dz.get("picture")}
            if i % 10 == 0 or i == len(missing):
                _write(data)
                print(f"music: {i}/{len(missing)}")
            time.sleep(1.05)  # MusicBrainz asks for ≤ 1 request/second
    return {n: data.get(n, {"genres": [], "related": [], "fans": 0, "picture": None}) for n in names}


def wanted_names() -> list[str]:
    """Artists whose metadata the recommender can use: everyone with an upcoming show, plus the real shows
    that replace Sam's placeholder history (seed.swap_placeholders). Other past artists stay cache-only."""
    import copy

    from . import fetch_venues, seed

    upcoming = fetch_venues.load_upcoming()
    past = fetch_venues.load_past()
    spec = copy.deepcopy(json.loads((ROOT / "seed" / "demo_events.json").read_text()))
    swapped = seed.swap_placeholders(spec, past)
    return sorted({r["artist"] for r in upcoming} | {r["artist"] for r in swapped})


if __name__ == "__main__":
    names = wanted_names()
    got = load(names)
    with_genres = sum(1 for v in got.values() if v["genres"])
    with_related = sum(1 for v in got.values() if v["related"])
    with_picture = sum(1 for v in got.values() if v.get("picture"))
    print(f"{len(names)} artists: {with_genres} with genres, {with_related} with related artists, {with_picture} with pictures (cache: {FILE.relative_to(ROOT)})")
