"""Shared enums & constants — mirrors web/src/constants.ts and AGENTS.md §4."""

DIMS = ["music", "crowd", "venue", "accessibility", "production", "value", "would_again"]

TAGS = {
    "music": ["tight", "sloppy", "deep cuts", "played the hits", "guest appearance", "short set", "extended set"],
    "crowd": ["mosh", "chill", "singalong", "phone-heavy", "rowdy", "respectful"],
    "venue": ["great sound", "muddy", "good sightlines", "cramped", "long bar lines", "easy in/out"],
    "accessibility": ["ADA honored", "strobes used", "interpreter present", "re-entry allowed", "quiet space", "accessible line long"],
    "production": ["lasers", "LED wall", "pyro", "minimal", "mix too loud", "mix too quiet"],
    "value": ["worth it", "overpriced", "fees hurt", "merch reasonable"],
}

# Cumulative upper bounds on rank position fraction: S top 15%, A next 25%, B next 35%, C rest.
TIERS = [("S", 0.15), ("A", 0.40), ("B", 0.75), ("C", 1.0)]

MATCH_THRESHOLDS = {"auto": 0.8, "ask": 0.4}

RANKER = {"beta": 1.0, "eta": 0.3, "var_shrink": 0.8, "prior_var": 1.0}

GROUP_LAMBDA = 0.5

NEEDS = ["mobility", "sensory", "hearing", "vision", "chronic", "neurodivergent"]

UNIFORM_WEIGHTS = [0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1429, 0.1426]
