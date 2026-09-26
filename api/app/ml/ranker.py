"""Multi-dimensional Bayesian Bradley–Terry ranking (DESIGN.md §7.2). NumPy only; no DB access.

Each show i has θ_i ∈ R^7 (the user's review scores) with scalar variance v_i; the user has
preference weights w on the simplex. s_i = w·θ_i and P(i ≻ j) = σ((s_i − s_j) / β).

The posterior over w is held as a fixed, seeded particle set (Dirichlet prior around uniform),
reweighted by the likelihood of every comparison. The displayed weights are the posterior mean.
Pairs are chosen by expected information gain about w (BALD), weighted toward the top of the list.
"""
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from ..constants import RANKER, TIERS

BETA, SHRINK, PRIOR_VAR = RANKER["beta"], RANKER["var_shrink"], RANKER["prior_var"]
N_PARTICLES = 2000
PRIOR_CONCENTRATION = 2.0
_PARTICLES = np.random.default_rng(1313).dirichlet(np.full(7, PRIOR_CONCENTRATION), size=N_PARTICLES)


@dataclass
class UserState:
    shows: list[str]                                  # event ids, aligned with theta/var rows
    theta: np.ndarray                                 # (n, 7)
    var: np.ndarray                                   # (n,)
    comparisons: list = field(default_factory=list)   # [(winner_id, loser_id)] in order
    new_show: Optional[str] = None                    # reviewed but never compared: goes first

    @property
    def asked(self) -> set:
        return {frozenset(c) for c in self.comparisons}


def init_theta(scores) -> np.ndarray:
    """θ from a review's 7 scores (would_again already stored as 1 or 5)."""
    return np.clip(np.asarray(scores, dtype=float), 1.0, 5.0)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _entropy(p):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return -(p * np.log2(p) + (1 - p) * np.log2(1 - p))


def posterior(state: UserState) -> np.ndarray:
    """Normalised particle weights given every comparison so far."""
    idx = {e: i for i, e in enumerate(state.shows)}
    logp = np.zeros(N_PARTICLES)
    for win, lose in state.comparisons:
        if win in idx and lose in idx:
            diff = state.theta[idx[win]] - state.theta[idx[lose]]
            logp += np.log(_sigmoid((_PARTICLES @ diff) / BETA) + 1e-12)
    p = np.exp(logp - logp.max())
    return p / p.sum()


def weights(state: UserState, post: Optional[np.ndarray] = None) -> np.ndarray:
    """Posterior mean of w (sums to 1)."""
    post = posterior(state) if post is None else post
    return post @ _PARTICLES


def tier(rank: int, n: int) -> str:
    frac = rank / n
    return next(t for t, upper in TIERS if frac <= upper + 1e-9)


def ranking(state: UserState) -> tuple[np.ndarray, list[dict]]:
    """(weights, [{event_id, theta, score, tier, rank}] best first)."""
    w = weights(state)
    s = state.theta @ w
    order = sorted(range(len(state.shows)), key=lambda i: (-s[i], state.shows[i]))
    n = len(order)
    return w, [{"event_id": state.shows[i], "theta": [round(float(x), 3) for x in state.theta[i]],
                "score": round(float(s[i]), 3), "tier": tier(r, n), "rank": r}
               for r, i in enumerate(order, 1)]


def next_pair(state: UserState) -> Optional[tuple[str, str]]:
    """Most informative unasked pair: IG(w; outcome) / (rank_i + rank_j).
    A new (never compared) show is always in the pair, listed first."""
    n = len(state.shows)
    if n < 2:
        return None
    post = posterior(state)
    s = state.theta @ weights(state, post)
    rank = np.empty(n)
    rank[np.argsort(-s, kind="stable")] = np.arange(1, n + 1)

    iu, ju = np.triu_indices(n, 1)
    forced = state.shows.index(state.new_show) if state.new_show in state.shows else None
    asked = state.asked
    keep = np.array([(forced is None or forced in (i, j))
                     and frozenset((state.shows[i], state.shows[j])) not in asked
                     for i, j in zip(iu, ju)], dtype=bool)
    if not keep.any():
        return None
    iu, ju = iu[keep], ju[keep]

    S = _PARTICLES @ state.theta.T                      # (P, n) scores per particle
    p = _sigmoid((S[:, iu] - S[:, ju]) / BETA)          # (P, pairs)
    info_gain = _entropy(post @ p) - post @ _entropy(p)
    best = int(np.argmax(info_gain / (rank[iu] + rank[ju])))
    i, j = int(iu[best]), int(ju[best])
    if forced is not None and forced == j:
        i, j = j, i
    return state.shows[i], state.shows[j]


def apply(state: UserState, event_a: str, event_b: str, winner: str) -> UserState:
    """Record a comparison (winner is an event id) and shrink both shows' variance."""
    loser = event_b if winner == event_a else event_a
    state.comparisons.append((winner, loser))
    for e in (event_a, event_b):
        state.var[state.shows.index(e)] *= SHRINK
    if state.new_show in (event_a, event_b):
        state.new_show = None
    return state
