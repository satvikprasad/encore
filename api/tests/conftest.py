import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.dbutil import make_db  # noqa: E402


@pytest.fixture(autouse=True)
def no_live_grok(monkeypatch):
    """Tests never call the real Grok API; tests that need a key set a fake one."""
    monkeypatch.delenv("GROK_API_KEY", raising=False)


@pytest.fixture
def db(tmp_path, monkeypatch):
    """Temp SQLite DB seeded from fixtures; the app is pointed at it via ENCORE_DB."""
    path = tmp_path / "encore.db"
    conn = make_db(path)
    monkeypatch.setenv("ENCORE_DB", str(path))
    yield conn
    conn.close()


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
