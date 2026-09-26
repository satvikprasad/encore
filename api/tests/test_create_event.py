"""User-added shows (POST /events) and the artist autocomplete, with Deezer/Nominatim stubbed out."""
import pytest

from app import artists


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    artists.artist_details.cache_clear()
    monkeypatch.setattr(artists, "search_artists", lambda q, limit=6: (
        [{"id": 1, "name": "Bruno Mars", "picture": "https://cdn.example/bruno.jpg", "fans": 9000000}] if "bruno" in q.lower() else []))
    monkeypatch.setattr(artists, "related_artists", lambda artist_id, limit=8: ["Anderson .Paak", "Silk Sonic"])
    monkeypatch.setattr(artists, "geocode", lambda place, city="Atlanta, GA": (33.7554, -84.4010) if "mercedes" in place.lower() else None)
    monkeypatch.setattr(artists.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("network call")))


def test_add_past_show_at_a_known_venue(client):
    r = client.post("/events?user=sam", json={"artist": "bruno mars", "venue": "state_farm", "date": "2025-11-02", "time": "19:30"})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["artist"]["name"] == "Bruno Mars" and e["venue"]["id"] == "state_farm" and e["is_past"] is True
    assert e["start_at"] == "2025-11-02T19:30:00-05:00" and e["image_url"] == "https://cdn.example/bruno.jpg"
    assert e["id"].startswith("u_")
    # Same artist + venue + night: the existing show, not a duplicate
    again = client.post("/events?user=sam", json={"artist": "Bruno Mars", "venue": "State Farm Arena", "date": "2025-11-02"}).json()
    assert again["id"] == e["id"]
    # It is searchable and can be marked / reviewed like any other show
    assert e["id"] in [x["id"] for x in client.get("/events?user=sam&q=bruno").json()]
    assert client.post("/attendance?user=sam", json={"event_id": e["id"], "status": "attended"}).status_code == 200
    assert client.get("/attendance/unranked?user=sam").json()[0]["id"] == e["id"]


def test_add_show_at_a_new_venue_geocodes_it(client):
    r = client.post("/events?user=sam", json={"artist": "Unknown Local Band", "venue": "Mercedes-Benz Stadium", "date": "2027-01-15"})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["artist"]["name"] == "Unknown Local Band" and e["image_url"] is None   # no Deezer match: name kept as typed
    assert e["venue"]["name"] == "Mercedes-Benz Stadium" and abs(e["venue"]["lat"] - 33.7554) < 1e-4 and e["is_past"] is False
    assert client.post("/events?user=sam", json={"artist": "X", "venue": "Nowhere Hall", "date": "2027-01-15"}).status_code == 422
    assert client.post("/events?user=sam", json={"artist": "X", "venue": "state_farm", "date": "not-a-date"}).status_code == 422
    assert client.post("/events?user=sam", json={"artist": "  ", "venue": "state_farm", "date": "2027-01-15"}).status_code == 422
    assert client.post("/events?user=ghost", json={"artist": "X", "venue": "state_farm", "date": "2027-01-15"}).status_code == 404


def test_artist_search_proxy(client):
    hits = client.get("/artists/search?q=bruno").json()
    assert hits == [{"id": 1, "name": "Bruno Mars", "picture": "https://cdn.example/bruno.jpg", "fans": 9000000}]
    assert client.get("/artists/search?q=zzz").json() == []
