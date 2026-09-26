"""Upcoming-show recommendations for the home feed ("For you": the top N with a reason each).

Every upcoming show the caller hasn't marked gets an additive, explainable score:
  friends  Σ over followed users interested/going        0.6 + 0.4·m/100   (m = taste match %)
  fans     Σ over verified users within 2 hops, going    0.5·m/100  (a 90% match ≈ a friend)
  artist   1.0 if the caller has attended this artist before (+0.5 if they'd go again)
  similar  0.7 if the show's artist is a Deezer "related artist" of someone the caller has seen (or vice
           versa), +0.3 if they'd see that artist again; see seed/fetch_music.py
  venue    0.15 per past visit to the venue, capped at 0.45
  genre    0.6 · Jaccard(show's genre tags, tags of everything the caller has attended)  (MusicBrainz tags)
The two strongest factors become the one-line reason shown under the card.
"""
import json
import sqlite3
from collections import Counter, defaultdict

from ..db import EVENT_SQL, event_from_row, following, load_user, user_from_row
from .taste import match_many, within_hops


def _first(users: dict, uid: str) -> str:
    return users[uid]["name"].split(" ")[0]


def _names(uids: list[str], users: dict) -> str:
    first = [_first(users, u) for u in uids]
    if len(first) == 1:
        return first[0]
    if len(first) == 2:
        return f"{first[0]} and {first[1]}"
    return f"{first[0]}, {first[1]} and {len(first) - 2} more"


def _fragment(factor: str, e: dict, friends: list[str], fans: list[str], matches: dict, users: dict,
              venues_seen: Counter, genres_seen: set) -> str:
    if factor == "friends":
        names = _names(sorted(friends, key=lambda u: (-matches[u], u)), users)
        return f"{names} {'are' if len(friends) > 1 else 'is'} going"
    if factor == "fans":
        top = max(fans, key=lambda u: (matches[u], u))
        return f"{_first(users, top)} ({matches[top]}% match) is going" if len(fans) == 1 else f"{len(fans)} fans like you"
    if factor == "artist":
        return f"You've seen {e['artist']['name']}"
    if factor == "similar":
        return f"Similar to {e['_similar_to']}, who you've seen"
    if factor == "venue":
        n = venues_seen[e["venue"]["id"]]
        return f"You've been to {e['venue']['name']} {n}×" if n > 1 else f"You've been to {e['venue']['name']}"
    shared = sorted(set(e["artist"]["genres"]) & genres_seen)
    return f"Fits your taste in {shared[0]}" if shared else ""


def _reason(parts: dict, e: dict, friends: list[str], fans: list[str], matches: dict, users: dict, venues_seen: Counter,
            genres_seen: set) -> str:
    """The two strongest positive factors, strongest first, e.g. "Priya is going · 2 fans like you"."""
    ranked = [f for f in sorted(parts, key=lambda f: -parts[f]) if parts[f] > 0][:2]
    bits = [b for b in (_fragment(f, e, friends, fans, matches, users, venues_seen, genres_seen) for f in ranked) if b]
    return " · ".join(bits) if bits else "New in Atlanta"


def recommend(conn: sqlite3.Connection, user: str, limit: int = 5) -> list[dict]:
    """Top `limit` upcoming shows for `user`, as RecommendedEvent dicts, best first."""
    me = load_user(conn, user)
    if me is None:
        return []
    users = {r["id"]: user_from_row(r) for r in conn.execute("SELECT * FROM users")}
    friends = following(conn, user)
    fans = {u for u in within_hops(conn, user) - friends if users[u]["verified"]}
    matches = match_many(conn, user, friends | fans)

    artists_seen: dict[str, int] = {}
    venues_seen: Counter = Counter()
    genres_seen: set[str] = set()
    seen_names: dict[str, tuple[str, int]] = {}   # lower-cased name -> (display name, would_again)
    related_seen: dict[str, tuple[str, int]] = {}  # lower-cased related name -> (seen artist, would_again)
    for r in conn.execute(
            "SELECT e.artist_id, e.venue_id, ar.name, ar.genres, ar.related, r.would_again FROM attendance a "
            "JOIN events e ON e.id = a.event_id JOIN artists ar ON ar.id = e.artist_id "
            "LEFT JOIN reviews r ON r.user_id = a.user_id AND r.event_id = a.event_id "
            "WHERE a.user_id = ? AND a.status = 'attended'", (user,)):
        again = r["would_again"] or 0
        artists_seen[r["artist_id"]] = max(artists_seen.get(r["artist_id"], 0), again)
        venues_seen[r["venue_id"]] += 1
        genres_seen.update(json.loads(r["genres"] or "[]"))
        seen_names[r["name"].lower()] = (r["name"], again)
        for rel in json.loads(r["related"] or "[]"):
            if rel.lower() not in related_seen or again > related_seen[rel.lower()][1]:
                related_seen[rel.lower()] = (r["name"], again)

    marked = {r[0] for r in conn.execute("SELECT event_id FROM attendance WHERE user_id = ?", (user,))}
    going: dict[str, list[str]] = defaultdict(list)
    for r in conn.execute("SELECT a.event_id, a.user_id FROM attendance a JOIN events e ON e.id = a.event_id "
                          "WHERE e.is_past = 0 AND a.status IN ('interested','going')"):
        going[r["event_id"]].append(r["user_id"])

    related_of = {r[0]: json.loads(r[1] or "[]") for r in conn.execute("SELECT id, related FROM artists")}
    out = []
    for row in conn.execute(EVENT_SQL + " WHERE e.is_past = 0 ORDER BY e.start_at"):
        e = event_from_row(row)
        if e["id"] in marked:
            continue
        f = [u for u in going.get(e["id"], []) if u in friends]
        fan = [u for u in going.get(e["id"], []) if u in fans]
        seen = artists_seen.get(e["artist"]["id"])
        g = set(e["artist"]["genres"])
        # Similar: this artist is related to someone the caller saw, or someone they saw is related to this artist.
        similar = related_seen.get(e["artist"]["name"].lower())
        if similar is None:
            for rel in related_of.get(e["artist"]["id"], []):
                if rel.lower() in seen_names:
                    similar = seen_names[rel.lower()]
                    break
        e["_similar_to"] = similar[0] if similar else None
        parts = {
            "friends": sum(0.6 + 0.4 * matches[u] / 100 for u in f),
            "fans": sum(0.5 * matches[u] / 100 for u in fan),
            "artist": 0.0 if seen is None else 1.0 + 0.5 * seen,
            "similar": 0.0 if similar is None or seen is not None else 0.7 + 0.3 * similar[1],
            "venue": min(0.45, 0.15 * venues_seen[e["venue"]["id"]]),
            "genre": 0.6 * len(g & genres_seen) / len(g | genres_seen) if g and genres_seen else 0.0,
        }
        score = sum(parts.values())
        reason = _reason(parts, e, f, fan, matches, users, venues_seen, genres_seen)
        e.pop("_similar_to", None)
        out.append({
            **e,
            "friends_interested": [users[u] for u in sorted(f, key=lambda u: users[u]["name"])],
            "reason": reason,
            "score": round(score, 3),
        })
    out.sort(key=lambda x: (-x["score"], x["start_at"], x["id"]))
    return out[:limit]
