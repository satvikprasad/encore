"""People — member search, profiles and follows (the "Search People → Profile → Follow" branch)."""
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from .. import schemas
from ..db import EVENT_SQL, event_from_row, following, get_db, load_user, user_from_row
from ..ml import taste
from .rank import load_state, ranking_response

router = APIRouter(tags=["people"])


def followers(conn, user_id: str) -> set[str]:
    return {r[0] for r in conn.execute("SELECT follower_id FROM follows WHERE followee_id = ?", (user_id,))}


@router.get("/people", response_model=list[schemas.PersonCard])
def list_people(user: str, q: Optional[str] = None, limit: int = 40, conn=Depends(get_db)):
    """Every other member, best taste match first; `q` filters by name."""
    needle = (q or "").strip().lower()
    rows = [r for r in conn.execute("SELECT * FROM users WHERE id != ? ORDER BY name", (user,))
            if not needle or needle in r["name"].lower()]
    matches = taste.match_many(conn, user, [r["id"] for r in rows])
    follows, fans = following(conn, user), followers(conn, user)
    counts = {r[0]: r[1] for r in conn.execute("SELECT user_id, COUNT(*) FROM reviews GROUP BY user_id")}
    out = [{"user": user_from_row(r), "match_pct": matches[r["id"]], "shows_count": counts.get(r["id"], 0),
            "following": r["id"] in follows, "follows_you": r["id"] in fans} for r in rows]
    out.sort(key=lambda p: (-p["match_pct"], p["user"]["name"]))
    return out[:limit]


@router.get("/users/{user_id}", response_model=schemas.UserProfile)
def user_profile(user_id: str, user: str, conn=Depends(get_db)):
    u = load_user(conn, user_id)
    if u is None:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    shows = ranking_response(conn, user_id, load_state(conn, user_id))["shows"]
    upcoming = [{"event": event_from_row(r), "status": r["status"]} for r in conn.execute(
        f"SELECT ev.*, at.status FROM ({EVENT_SQL}) ev JOIN attendance at ON at.event_id = ev.id "
        "WHERE at.user_id = ? AND at.status IN ('interested','going') AND ev.is_past = 0 ORDER BY ev.start_at",
        (user_id,))]
    return {
        "user": u,
        "following": user_id in following(conn, user),
        "follows_you": user in following(conn, user_id),
        "followers": len(followers(conn, user_id)),
        "following_count": len(following(conn, user_id)),
        "match_pct": None if user_id == user else taste.match(user, user_id, conn),
        "shows": shows,
        "upcoming": upcoming,
    }


@router.post("/follows", response_model=schemas.FollowResponse)
def set_follow(body: schemas.FollowRequest, user: str, conn=Depends(get_db)):
    if body.user_id == user or load_user(conn, body.user_id) is None:
        return JSONResponse(status_code=400, content={"error": "bad_user"})
    if body.follow:
        conn.execute("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)", (user, body.user_id))
    else:
        conn.execute("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", (user, body.user_id))
    conn.commit()
    return {"following": sorted(following(conn, user))}
