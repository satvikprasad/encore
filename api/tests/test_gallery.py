"""Photos & videos: upload (raw body), visibility through follows, feed, delete, and file serving."""
from pathlib import Path

import pytest

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"


@pytest.fixture
def media_root(tmp_path, monkeypatch):
    root = tmp_path / "media"
    monkeypatch.setenv("MEDIA_ROOT", str(root))
    monkeypatch.delenv("MEDIA_STORAGE", raising=False)
    return root


def upload(client, user, event, body=JPEG, ctype="image/jpeg", **params):
    return client.post(f"/media/upload?user={user}&event={event}&name=x.jpg" + "".join(f"&{k}={v}" for k, v in params.items()),
                       content=body, headers={"Content-Type": ctype})


def test_upload_and_serve(client, media_root):
    r = upload(client, "sam", "d04", caption="LED wall")
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["kind"] == "image" and m["user"]["id"] == "sam" and m["event"]["id"] == "d04" and m["caption"] == "LED wall"
    assert m["bytes"] == len(JPEG) and m["url"].startswith("http://localhost:8000/media-files/sam/d04/")
    stored = Path(media_root) / m["url"].split("/media-files/")[1]
    assert stored.read_bytes() == JPEG
    served = client.get("/media-files/" + m["url"].split("/media-files/")[1])
    assert served.status_code == 200 and served.content == JPEG
    assert client.get("/media-files/../../etc/passwd").status_code == 404
    assert client.get("/media-files/sam/d04/nope.jpg").status_code == 404


def test_upload_rejects_bad_input(client, media_root):
    assert upload(client, "sam", "d04", ctype="text/plain").status_code == 415
    assert upload(client, "sam", "d04", body=b"").status_code == 400
    assert upload(client, "sam", "nope").status_code == 404
    assert upload(client, "ghost", "d04").status_code == 404
    video = upload(client, "sam", "d04", body=b"\x00" * 100, ctype="video/mp4").json()
    assert video["kind"] == "video" and video["url"].endswith(".mp4")


def test_visibility_follows_the_follow_graph(client, media_root):
    # sam follows priya, dev, lena; maya follows priya; jordan follows dev (tests/dbutil.py)
    priya = upload(client, "priya", "t01").json()
    sam = upload(client, "sam", "t01").json()
    ids = lambda r: [m["id"] for m in r.json()]
    assert ids(client.get("/media?user=sam&event=t01")) == [sam["id"], priya["id"]] or set(ids(client.get("/media?user=sam&event=t01"))) == {sam["id"], priya["id"]}
    assert ids(client.get("/media?user=maya&event=t01")) == [priya["id"]]      # follows priya, not sam
    assert ids(client.get("/media?user=jordan&event=t01")) == []               # follows neither
    assert ids(client.get("/media?user=priya&event=t01")) == [priya["id"]]     # own only: priya doesn't follow sam
    assert ids(client.get("/media?user=sam&of=priya")) == [priya["id"]]
    assert ids(client.get("/media?user=jordan&of=priya")) == []                # not following: nothing, no error
    assert client.get("/media?user=sam").status_code == 400
    feed = client.get("/media/feed?user=sam").json()
    assert [m["id"] for m in feed] == [priya["id"]] and feed[0]["user"]["name"] == "Jasmine Liu"   # friends only, not own
    assert client.get("/media/feed?user=priya").json() == []


def test_delete_is_owner_only(client, media_root):
    m = upload(client, "sam", "d04").json()
    assert client.delete(f"/media/{m['id']}?user=priya").status_code == 403
    assert client.delete(f"/media/{m['id']}?user=sam").json() == {"ok": True}
    assert client.get("/media?user=sam&event=d04").json() == []
    assert not (Path(media_root) / m["url"].split("/media-files/")[1]).exists()
    assert client.delete(f"/media/{m['id']}?user=sam").status_code == 404
