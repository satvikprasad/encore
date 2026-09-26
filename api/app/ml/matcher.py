"""Photo -> event matching (DESIGN.md §7.1). Pure function; no DB access."""
import math
from collections import defaultdict
from datetime import datetime, timedelta

from ..constants import MATCH_THRESHOLDS

EARTH_R_M = 6_371_000.0
MULTI_ROOM_PRIOR = 0.6


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


def parse_time(s: str) -> datetime:
    """ISO 8601 with offset (a trailing Z is accepted)."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def event_window(event: dict) -> tuple[datetime, datetime]:
    if event.get("doors_at"):
        doors = parse_time(event["doors_at"])
        return doors - timedelta(minutes=30), doors + timedelta(hours=6)
    start = parse_time(event["start_at"])
    return start - timedelta(hours=2), start + timedelta(hours=5)


def match(items: list[dict], venues: list[dict], events: list[dict]) -> list[dict]:
    """Match photos to events.

    items:  [{lat, lng, captured_at}]
    venues: [{id, lat, lng, geofence_radius_m, multi_room}]
    events: [{id, venue_id, start_at, doors_at}]
    Returns [{cluster_id, event_id, confidence, photo_count, suggested}] sorted by
    event start, one per (venue, date) cluster, dropping clusters below the ask threshold.
    """
    events_by_venue = defaultdict(list)
    for e in events:
        events_by_venue[e["venue_id"]].append((e, *event_window(e)))

    # (venue_id, event date) -> event_id -> per-photo scores
    clusters: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    starts = {}
    for item in items:
        t = parse_time(item["captured_at"])
        for v in venues:
            r = v["geofence_radius_m"]
            d = haversine_m(item["lat"], item["lng"], v["lat"], v["lng"])
            if d > r:
                continue
            prior = MULTI_ROOM_PRIOR if v["multi_room"] else 1.0
            for e, lo, hi in events_by_venue[v["id"]]:
                if lo <= t <= hi:
                    clusters[(v["id"], e["start_at"][:10])][e["id"]].append(math.exp(-d / r) * prior)
                    starts[e["id"]] = e["start_at"]

    out = []
    for (venue_id, date), by_event in clusters.items():
        # Noisy-OR per event; a (venue, night) cluster resolves to its most likely event.
        conf = {eid: 1 - math.prod(1 - c for c in cs) for eid, cs in by_event.items()}
        event_id = max(conf, key=lambda eid: (conf[eid], eid))
        c = conf[event_id]
        if c < MATCH_THRESHOLDS["ask"]:
            continue
        out.append({
            "cluster_id": f"{date}_{venue_id}",
            "event_id": event_id,
            "confidence": round(c, 3),
            "photo_count": len(by_event[event_id]),
            "suggested": "auto" if c >= MATCH_THRESHOLDS["auto"] else "ask",
        })
    out.sort(key=lambda m: starts[m["event_id"]])
    return out
