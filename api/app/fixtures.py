"""Load canned responses from <repo>/fixtures/ — used by router stubs until the real endpoint is green."""
import json
from functools import lru_cache

from .db import REPO_ROOT

FIXTURES_DIR = REPO_ROOT / "fixtures"


@lru_cache(maxsize=None)
def _load(name: str) -> str:
    return (FIXTURES_DIR / name).read_text()


def fixture(name: str):
    """Fresh copy of fixtures/<name> so callers can mutate it."""
    return json.loads(_load(name))
