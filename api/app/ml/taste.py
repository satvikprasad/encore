"""Taste match (DESIGN.md §7.3) and match-candidate retrieval for an event.

m(u, v) = α·ρ_Spearman(scores on shared reviewed shows) + (1 − α)·cos(w_u, w_v), α = min(1, k/8),
reported as an integer percentage (negative matches clip to 0).
"""
import json
import sqlite3
from collections import deque
from contextlib import closing
from typing import Optional

import numpy as np
from scipy.stats import spearmanr

from ..db import connect, following, load_user


def _profile(conn: sqlite3.Connection, user_id: str) -> tuple[np.ndarray, dict[str, float]]:
    """(weights, {event_id: w·θ}) over the user's reviewed shows."""
    w = np.array(json.loads(conn.execute("SELECT weights FROM users WHERE id = ?", (user_id,)).fetchone()[0]))
    rows = conn.execute("SELECT event_id, theta FROM reviews WHERE user_id = ?", (user_id,))
    return w, {r[0]: float(w @ np.array(json.loads(r[1]))) for r in rows}


def match_score(w_a, scores_a: dict, w_b, scores_b: dict) -> tuple[int, list[str]]:
    """(match %, shared reviewed event ids)."""
    shared = sorted(set(scores_a) & set(scores_b))
    k = len(shared)
    rho = 0.0
    if k >= 2:
        a, b = [scores_a[e] for e in shared], [scores_b[e] for e in shared]
        r = spearmanr(a, b).statistic if len(set(a)) > 1 and len(set(b)) > 1 else np.nan
        rho = 0.0 if np.isnan(r) else float(r)
    cos = float(np.dot(w_a, w_b) / (np.linalg.norm(w_a) * np.linalg.norm(w_b)))
    alpha = min(1.0, k / 8)
    m = alpha * rho + (1 - alpha) * cos
    return int(round(100 * max(0.0, m))), shared


def match(user_a: str, user_b: str, conn: Optional[sqlite3.Connection] = None) -> int:
    """Taste match between two users, 0–100. Symmetric."""
    if conn is None:
        with closing(connect()) as c:
            return match(user_a, user_b, c)
    return match_score(*_profile(conn, user_a), *_profile(conn, user_b))[0]


def _neighbours(conn: sqlite3.Connection, user_id: str) -> set[str]:
    rows = conn.execute("SELECT followee_id FROM follows WHERE follower_id = ? "
                        "UNION SELECT follower_id FROM follows WHERE followee_id = ?", (user_id, user_id))
    return {r[0] for r in rows}


def within_hops(conn: sqlite3.Connection, user_id: str, hops: int = 2) -> set[str]:
    """Users reachable in ≤ hops follow edges (either direction), excluding the user."""
    seen, frontier = {user_id}, deque([(user_id, 0)])
    while frontier:
        u, d = frontier.popleft()
        if d == hops:
            continue
        for v in _neighbours(conn, u) - seen:
            seen.add(v)
            frontier.append((v, d + 1))
    return seen - {user_id}


def candidates(user: str, event_id: str, conn: Optional[sqlite3.Connection] = None) -> list[dict]:
    """Verified users within 2 hops (not already direct follows) who are interested in or going
    to the event, best match first, max 5. explanation/icebreaker are filled in by ai.explain."""
    if conn is None:
        with closing(connect()) as c:
            return candidates(user, event_id, c)
    pool = within_hops(conn, user) - following(conn, user)
    if not pool:
        return []
    marks = ",".join("?" * len(pool))
    rows = conn.execute(
        f"SELECT a.user_id FROM attendance a JOIN users u ON u.id = a.user_id "
        f"WHERE a.event_id = ? AND a.status IN ('interested','going') AND u.verified = 1 "
        f"AND a.user_id IN ({marks})", (event_id, *sorted(pool)))
    me = _profile(conn, user)
    attended = {r[0] for r in conn.execute(
        "SELECT event_id FROM attendance WHERE user_id = ? AND status = 'attended'", (user,))}
    out = []
    for (other,) in rows:
        pct, _ = match_score(*me, *_profile(conn, other))
        shared = sorted(attended & {r[0] for r in conn.execute(
            "SELECT event_id FROM attendance WHERE user_id = ? AND status = 'attended'", (other,))})
        out.append({"user": load_user(conn, other), "match_pct": pct, "shared_event_ids": shared,
                    "explanation": None, "icebreaker": None})
    out.sort(key=lambda c: (-c["match_pct"], c["user"]["id"]))
    return out[:5]


def match_many(conn: sqlite3.Connection, user: str, others) -> dict[str, int]:
    """Taste match from `user` to each of `others`, computing the caller's profile once."""
    me = _profile(conn, user)
    return {o: match_score(*me, *_profile(conn, o))[0] for o in others}
