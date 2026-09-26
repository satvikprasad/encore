"""Taste personas for synthetic users (DESIGN.md §5). Means are over
[music, crowd, venue, accessibility, production, value]; weights over all 7 dims."""
import random

from app.constants import TAGS

PERSONAS = {
    "production": {"means": [3.6, 2.6, 3.4, 3.5, 4.6, 3.3],
                   "weights": [0.13, 0.07, 0.11, 0.10, 0.32, 0.12, 0.15],
                   "tags": {"production": ["lasers", "LED wall", "pyro"], "crowd": ["phone-heavy", "chill"]}},
    "music": {"means": [4.5, 3.2, 3.4, 3.3, 3.0, 3.5],
              "weights": [0.34, 0.10, 0.10, 0.08, 0.12, 0.11, 0.15],
              "tags": {"music": ["tight", "deep cuts", "extended set"], "production": ["minimal"]}},
    "crowd": {"means": [3.6, 4.5, 3.2, 3.2, 3.4, 3.4],
              "weights": [0.14, 0.34, 0.10, 0.08, 0.12, 0.08, 0.14],
              "tags": {"crowd": ["mosh", "singalong", "rowdy"], "music": ["played the hits"]}},
    "value": {"means": [3.6, 3.3, 3.3, 3.4, 3.2, 4.3],
              "weights": [0.14, 0.10, 0.10, 0.10, 0.10, 0.32, 0.14],
              "tags": {"value": ["worth it", "overpriced", "fees hurt"]}},
    "venue": {"means": [3.7, 3.2, 4.4, 3.8, 3.5, 3.3],
              "weights": [0.14, 0.08, 0.32, 0.12, 0.12, 0.08, 0.14],
              "tags": {"venue": ["great sound", "good sightlines", "muddy"]}},
    "access": {"means": [3.6, 3.1, 3.6, 4.4, 3.3, 3.4],
               "weights": [0.13, 0.08, 0.13, 0.32, 0.10, 0.10, 0.14],
               "tags": {"accessibility": ["ADA honored", "quiet space", "re-entry allowed"]}},
}

SIGMA = 0.7


def sample_scores(persona: str, rng: random.Random) -> list[int]:
    """Six 1–5 integer scores around the persona means plus would_again (1 or 5)."""
    means = PERSONAS[persona]["means"]
    scores = [min(5, max(1, round(rng.gauss(m, SIGMA)))) for m in means]
    would_again = 5 if sum(scores) / 6 + rng.gauss(0, 0.4) >= 3.3 else 1
    return scores + [would_again]


def sample_tags(persona: str, rng: random.Random) -> list[str]:
    pool = [t for tags in PERSONAS[persona]["tags"].values() for t in tags]
    extra = [t for dim_tags in TAGS.values() for t in dim_tags]
    return sorted(set(rng.sample(pool, k=min(2, len(pool))) + ([rng.choice(extra)] if rng.random() < 0.3 else [])))
