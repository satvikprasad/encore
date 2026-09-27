"""Ranker (AGENTS.md §9 M2 ranker)."""
import time

import numpy as np

from app.ml import ranker

PRODUCTION = 4
TRUE_W = np.array([0.15, 0.08, 0.10, 0.10, 0.32, 0.10, 0.15])


def _synthetic(seed: int):
    """A user who rated 10 shows (integer 1–5 scores) and ranks them by hidden, production-heavy
    weights. The true ordering is known; the model starts from uniform weights."""
    rng = np.random.default_rng(seed)
    reviews = np.clip(np.rint(rng.normal(3.2, 0.9, size=(10, 7))), 1, 5)
    reviews[:, 6] = np.where(reviews[:, 6] > 3, 5.0, 1.0)
    shows = [f"s{i}" for i in range(10)]
    state = ranker.UserState(shows=shows, theta=np.array([ranker.init_theta(r) for r in reviews]),
                             var=np.full(10, ranker.PRIOR_VAR))
    truth = reviews @ TRUE_W
    return state, truth, [shows[i] for i in np.argsort(-truth)]


def _answer(state, truth, a, b):
    ia, ib = state.shows.index(a), state.shows.index(b)
    ranker.apply(state, a, b, a if truth[ia] > truth[ib] else b)


def test_recovers_top3_with_six_questions():
    wins = 0
    for seed in range(10):
        state, truth, true_order = _synthetic(seed)
        for _ in range(6):
            _answer(state, truth, *ranker.next_pair(state))
        wins += [r["event_id"] for r in ranker.ranking(state)[1][:3]] == true_order[:3]
    assert wins >= 8, wins


def test_weights_move_toward_production():
    # Sam-like: production-heavy shows win even when they were worse on the crowd.
    shows = ["hi_prod", "hi_crowd", "mid", "low"]
    theta = np.array([[3, 2, 3, 4, 5, 3, 5],
                      [3, 5, 3, 4, 3, 3, 5],
                      [4, 3, 3, 3, 4, 3, 5],
                      [4, 4, 4, 3, 2, 4, 5]], dtype=float)
    state = ranker.UserState(shows=shows, theta=theta, var=np.ones(4))
    before = ranker.weights(state)
    assert np.allclose(before, 1 / 7, atol=0.01)
    for a, b in [("hi_prod", "hi_crowd"), ("mid", "low"), ("hi_prod", "low")]:
        ranker.apply(state, a, b, a)
    w = ranker.weights(state)
    assert int(np.argmax(w)) == PRODUCTION and w[PRODUCTION] > before[PRODUCTION] + 0.05
    assert abs(w.sum() - 1) < 1e-9
    assert np.allclose(state.var, [0.64, 0.8, 0.8, 0.64])


def test_new_show_first_and_no_repeats():
    state, truth, _ = _synthetic(0)
    state.new_show = "s7"
    a, _ = ranker.next_pair(state)
    assert a == "s7"
    seen = set()
    while (pair := ranker.next_pair(state)) is not None:
        assert frozenset(pair) not in seen
        seen.add(frozenset(pair))
        _answer(state, truth, *pair)
    assert len(seen) == 45


def test_focus_show_stays_in_every_pair():
    rng = np.random.default_rng(7)
    shows = [f"s{i}" for i in range(6)]
    state = ranker.UserState(shows=shows, theta=rng.uniform(1, 5, (6, 7)), var=np.ones(6))
    asked = []
    while (pair := ranker.next_pair(state, focus="s3")) is not None and len(asked) < 5:
        assert pair[0] == "s3" and pair[1] != "s3" and frozenset(pair) not in map(frozenset, asked)
        asked.append(pair)
        ranker.apply(state, *pair, winner=pair[0])
    assert len(asked) == 5  # one question per other show, then the search widens
    widened = ranker.next_pair(state, focus="s3")
    assert widened is not None and "s3" not in widened


def test_tiers():
    assert "".join(ranker.tier(r, 10) for r in range(1, 11)) == "SAAABBBCCC"


def test_fast_enough():
    state, truth, _ = _synthetic(1)
    for _ in range(6):
        _answer(state, truth, *ranker.next_pair(state))
    state = ranker.UserState(shows=[f"s{i}" for i in range(25)],
                             theta=np.random.default_rng(0).integers(1, 6, size=(25, 7)).astype(float),
                             var=np.ones(25), comparisons=[("s0", "s1"), ("s2", "s3")])
    start = time.perf_counter()
    ranker.next_pair(state)
    ranker.ranking(state)
    assert time.perf_counter() - start < 0.05
