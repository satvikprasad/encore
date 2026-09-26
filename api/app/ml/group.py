"""Group plan scorer (DESIGN.md §7.4).

max_e Σ_u ŝ_u(e) − λ·Var_u ŝ_u(e)  s.t.  price(e) ≤ min_u budget_u,  venue(e) ⊨ ∪_u needs_u
with ŝ_u(e) = w_u · θ̄_artist(e) (population-mean review vector, adjusted per price tier), scaled to [0, 1].
"""
import json
import sqlite3
from contextlib import closing
from typing import Optional

import numpy as np

from ..constants import GROUP_LAMBDA
from ..db import connect, load_event, load_users

TIER_LABELS = ["Balcony", "Main floor", "Premium"]
# Moving up a tier (f from 0 to 1) buys a better view of the room and the production and costs value.
TIER_EFFECT = np.array([0.0, 0.0, 0.5, 0.0, 0.6, -1.2, 0.0])
NEUTRAL_THETA = np.full(7, 3.0)


def need_met(need: str, access: dict) -> bool:
    """Constraint satisfaction rules from AGENTS.md §3."""
    if need == "mobility":
        return access["step_free"] and access["ada_seating"]
    if need in ("sensory", "neurodivergent"):
        return access["quiet_room"] and access["strobe_policy"] != "unrestricted"
    if need == "hearing":
        return access["interpreter"] == "on_request"
    return access["ada_seating"]  # vision, chronic


def _mean_theta(conn: sqlite3.Connection, artist_id: str) -> np.ndarray:
    rows = conn.execute("SELECT r.theta FROM reviews r JOIN events e ON e.id = r.event_id "
                        "WHERE e.artist_id = ?", (artist_id,)).fetchall()
    if not rows:  # no one has reviewed this artist yet: population mean over all reviews
        rows = conn.execute("SELECT theta FROM reviews").fetchall()
    if not rows:
        return NEUTRAL_THETA
    return np.mean([json.loads(r[0]) for r in rows], axis=0)


def _tiers(event: dict) -> list[tuple[str, float, float]]:
    """[(label, price, f)] where f ∈ [0, 1] is how far up the price range the tier sits."""
    lo, hi = event["price_min"], event["price_max"]
    if lo is None and hi is None:
        return [("General admission", 0.0, 0.0)]
    if lo is None or hi is None or hi <= lo:
        return [("General admission", float(lo if lo is not None else hi), 0.0)]
    return [(label, round(lo + f * (hi - lo), 2), f) for label, f in zip(TIER_LABELS, (0.0, 0.5, 1.0))]


def score_options(crew_member_ids: list[str], event_id: str,
                  conn: Optional[sqlite3.Connection] = None) -> list[dict]:
    """Options for the crew, best first: feasible options by objective, then infeasible ones.
    Each: {event_id, tier_label, price, objective, feasible, violations, per_member:[{user_id, score}]}."""
    if conn is None:
        with closing(connect()) as c:
            return score_options(crew_member_ids, event_id, c)
    event = load_event(conn, event_id)
    members = load_users(conn, crew_member_ids)
    base = _mean_theta(conn, event["artist"]["id"])
    access = event["venue"]["access_profile"]
    budgets = [m["budget_max"] for m in members if m["budget_max"] is not None]
    budget = min(budgets) if budgets else None
    unmet = [f"{m['id']}:{n}" for m in members for n in m["accessibility_needs"] if not need_met(n, access)]

    options = []
    for label, price, f in _tiers(event):
        theta = np.clip(base + f * TIER_EFFECT, 1.0, 5.0)
        s = np.array([(np.array(m["weights"]) @ theta - 1.0) / 4.0 for m in members])
        violations = list(unmet)
        if budget is not None and price > budget:
            violations.append(f"budget:{budget:g}")
        options.append({
            "event_id": event_id, "tier_label": label, "price": price,
            "objective": round(float(s.sum() - GROUP_LAMBDA * s.var()), 4),
            "feasible": not violations, "violations": violations,
            "per_member": [{"user_id": m["id"], "score": round(float(x), 3)} for m, x in zip(members, s)],
        })
    options.sort(key=lambda o: (not o["feasible"], -o["objective"]))
    return options[:3]
