"""Match explanation + icebreaker for a MatchCandidate (Grok with template fallback)."""
import json
import re
import sqlite3
from collections import Counter
from typing import Optional

from ..constants import DIMS, TAGS
from ..db import load_event
from . import grok, prompts

FALLBACK = ("You both rated {artist} highly and care most about {dim}.",
            "Ask them what they thought of the {tag} at {venue}.")

# Dims a person can "care most about" (would_again is a verdict, not a preference).
_PREF_DIMS = DIMS[:6]


def shared_shows(conn: sqlite3.Connection, viewer: str, other: str, event_ids: list[str]) -> list[dict]:
    """Shared shows with both users' overall scores (w·θ) and review tags, best first."""
    weights = {u: json.loads(conn.execute("SELECT weights FROM users WHERE id = ?", (u,)).fetchone()[0])
               for u in (viewer, other)}
    shows = []
    for eid in event_ids:
        event = load_event(conn, eid)
        if event is None:
            continue
        show = {"event_id": eid, "artist": event["artist"]["name"], "venue": event["venue"]["name"], "tags": []}
        for role, uid in (("viewer", viewer), ("other", other)):
            row = conn.execute("SELECT theta, tags FROM reviews WHERE user_id = ? AND event_id = ?",
                               (uid, eid)).fetchone()
            show[f"{role}_score"] = (round(sum(w * t for w, t in zip(weights[uid], json.loads(row["theta"]))), 2)
                                     if row else None)
            show["tags"] += json.loads(row["tags"]) if row else []
        shows.append(show)
    shows.sort(key=lambda s: (s["viewer_score"] or 0) + (s["other_score"] or 0), reverse=True)
    return shows


def top_dim(weights_a: list[float], weights_b: list[float]) -> str:
    combined = [a + b for a, b in zip(weights_a[:6], weights_b[:6])]
    return _PREF_DIMS[max(range(6), key=combined.__getitem__)]


def fallback(shows: list[dict], weights_a: list[float], weights_b: list[float]) -> tuple[str, str]:
    dim = top_dim(weights_a, weights_b)
    best = shows[0] if shows else {"artist": "the same shows", "venue": "the show", "tags": []}
    tags = Counter(best["tags"])
    # Prefer a tag about the shared top dimension, then any tag, then the dimension itself.
    tag = next((t for t, _ in tags.most_common() if t in TAGS.get(dim, [])), None) \
        or next(iter(tags), None) or dim
    return (FALLBACK[0].format(artist=best["artist"], dim=dim),
            FALLBACK[1].format(tag=tag, venue=best["venue"]))


def _count_sentences(text: str) -> int:
    return len([s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s])


def _validator(shows: list[dict]):
    artists = {s["artist"] for s in shows}

    def parse(content: str) -> tuple[str, str]:
        obj = grok.parse_json_object(content)
        explanation, icebreaker = str(obj["explanation"]).strip(), str(obj["icebreaker"]).strip()
        if not explanation or not icebreaker:
            raise ValueError("empty field")
        if _count_sentences(explanation) > 2:
            raise ValueError("explanation longer than 2 sentences")
        if artists and not any(a in explanation or a in icebreaker for a in artists):
            raise ValueError("no shared artist cited")
        return explanation, icebreaker

    return parse


def explain(candidate: dict, shows: list[dict], viewer: dict, event: Optional[dict] = None) -> tuple[str, str]:
    """(explanation, icebreaker) for `viewer` looking at `candidate` (a MatchCandidate dict)."""
    other = candidate["user"]
    fb = fallback(shows, viewer["weights"], other["weights"])
    payload = {
        "viewer": {"name": viewer["name"].split()[0],
                   "cares_most_about": _ranked_dims(viewer["weights"])},
        "match": {"name": other["name"].split()[0], "match_pct": candidate["match_pct"],
                  "cares_most_about": _ranked_dims(other["weights"])},
        "upcoming_show": ({"artist": event["artist"]["name"], "venue": event["venue"]["name"]}
                          if event else None),
        "shared_shows": [{k: s[k] for k in ("artist", "venue", "viewer_score", "other_score", "tags")}
                         for s in shows],
    }
    return grok.chat(prompts.explain_messages(payload), fallback=fb, parse=_validator(shows), json_mode=True)


def _ranked_dims(weights: list[float]) -> list[str]:
    return sorted(_PREF_DIMS, key=lambda d: weights[DIMS.index(d)], reverse=True)[:3]
