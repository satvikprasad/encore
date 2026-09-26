"""Photo -> event matching (AGENTS.md §9 M2 matcher). Literal data from AGENTS.md §7.1/§7.2/§7.4,
identical to demo_photos/make_photos.sh."""
from app.ml.matcher import haversine_m, match

VENUES = [
    {"id": "tabernacle", "lat": 33.7586, "lng": -84.3913, "geofence_radius_m": 120, "multi_room": False},
    {"id": "eastern", "lat": 33.7524, "lng": -84.3648, "geofence_radius_m": 150, "multi_room": False},
    {"id": "variety", "lat": 33.7649, "lng": -84.3492, "geofence_radius_m": 100, "multi_room": False},
    {"id": "terminal_west", "lat": 33.7830, "lng": -84.4108, "geofence_radius_m": 120, "multi_room": False},
    {"id": "state_farm", "lat": 33.7573, "lng": -84.3963, "geofence_radius_m": 300, "multi_room": False},
    {"id": "roxy", "lat": 33.8898, "lng": -84.4686, "geofence_radius_m": 200, "multi_room": False},
    {"id": "masquerade", "lat": 33.7522, "lng": -84.3915, "geofence_radius_m": 120, "multi_room": True},
]

EVENTS = [
    {"id": "d01", "venue_id": "tabernacle", "start_at": "2025-10-11T20:00:00-04:00", "doors_at": "2025-10-11T19:00:00-04:00"},
    {"id": "d02", "venue_id": "eastern", "start_at": "2025-11-22T20:00:00-05:00", "doors_at": "2025-11-22T19:00:00-05:00"},
    {"id": "d03", "venue_id": "variety", "start_at": "2026-01-17T20:00:00-05:00", "doors_at": None},
    {"id": "d04", "venue_id": "state_farm", "start_at": "2026-02-28T19:30:00-05:00", "doors_at": "2026-02-28T18:30:00-05:00"},
    {"id": "d05", "venue_id": "terminal_west", "start_at": "2026-04-04T20:00:00-04:00", "doors_at": None},
    {"id": "d06", "venue_id": "roxy", "start_at": "2026-06-13T20:00:00-04:00", "doors_at": "2026-06-13T19:00:00-04:00"},
    # distractors: other nights at the same venues, and a Masquerade show the night of the decoy
    {"id": "x01", "venue_id": "tabernacle", "start_at": "2025-10-12T20:00:00-04:00", "doors_at": None},
    {"id": "x02", "venue_id": "masquerade", "start_at": "2026-03-14T20:00:00-04:00", "doors_at": "2026-03-14T19:00:00-04:00"},
]

PHOTOS = [  # (lat, lng, captured_at) — 2 per show, 10 min apart, 90–150 min after start
    (33.7588, -84.3911, "2025-10-11T21:30:00-04:00"), (33.7584, -84.3915, "2025-10-11T21:40:00-04:00"),
    (33.7526, -84.3646, "2025-11-22T22:00:00-05:00"), (33.7522, -84.3650, "2025-11-22T22:10:00-05:00"),
    (33.7651, -84.3490, "2026-01-17T21:45:00-05:00"), (33.7647, -84.3494, "2026-01-17T21:55:00-05:00"),
    (33.7576, -84.3960, "2026-02-28T21:15:00-05:00"), (33.7570, -84.3966, "2026-02-28T21:25:00-05:00"),
    (33.7832, -84.4106, "2026-04-04T22:15:00-04:00"), (33.7828, -84.4110, "2026-04-04T22:25:00-04:00"),
    (33.8901, -84.4683, "2026-06-13T22:20:00-04:00"), (33.8895, -84.4689, "2026-06-13T22:30:00-04:00"),
]
DECOYS = [
    (33.7851, -84.3738, "2025-12-06T21:00:00-05:00"),  # Piedmont Park
    (33.7522, -84.3915, "2026-03-14T15:00:00-04:00"),  # Masquerade, outside the event window
]


def _items(rows):
    return [{"lat": a, "lng": b, "captured_at": t} for a, b, t in rows]


def test_demo_photos_make_six_auto_clusters():
    out = match(_items(PHOTOS + DECOYS), VENUES, EVENTS)
    assert [m["event_id"] for m in out] == ["d01", "d02", "d03", "d04", "d05", "d06"]
    assert all(m["confidence"] >= 0.8 and m["suggested"] == "auto" and m["photo_count"] == 2 for m in out)
    assert out[0]["cluster_id"] == "2025-10-11_tabernacle"


def test_decoys_match_nothing():
    assert match(_items(DECOYS), VENUES, EVENTS) == []


def test_single_far_photo_is_ask_or_ignored():
    # ~100 m from Tabernacle (r=120): exp(-100/120) ≈ 0.43 → "ask"
    out = match(_items([(33.7595, -84.3913, "2025-10-11T21:30:00-04:00")]), VENUES, EVENTS)
    assert len(out) == 1 and out[0]["suggested"] == "ask"
    # multi-room prior drops a single Masquerade photo inside the window below auto
    out = match(_items([(33.7522, -84.3915, "2026-03-14T21:00:00-04:00")]), VENUES, EVENTS)
    assert out[0]["event_id"] == "x02" and out[0]["confidence"] == 0.6 and out[0]["suggested"] == "ask"


def test_utc_timestamps_are_equivalent():
    out = match(_items([(33.7588, -84.3911, "2025-10-12T01:30:00Z"), (33.7584, -84.3915, "2025-10-12T01:40:00Z")]),
                VENUES, EVENTS)
    assert [m["event_id"] for m in out] == ["d01"]


def test_haversine():
    assert abs(haversine_m(33.7586, -84.3913, 33.7595, -84.3913) - 100) < 1
