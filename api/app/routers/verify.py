"""M4 — identity verification (mocked)."""
import json
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, JSONResponse

from .. import schemas
from ..db import get_db
from ..verify.mock import MOCK_PAGE, MockProvider

router = APIRouter(tags=["verify"])
provider = MockProvider()

# returnTo may only point back at our own frontend (or be a relative path).
ALLOWED_RETURN_ORIGINS = {"http://localhost:3000"}


def _safe_return_to(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url)
    if not parsed.scheme and not parsed.netloc and url.startswith("/") and not url.startswith("//"):
        return url
    if f"{parsed.scheme}://{parsed.netloc}" in ALLOWED_RETURN_ORIGINS:
        return url
    return None


@router.post("/verify/start", response_model=schemas.VerifyStartResponse)
def verify_start(user: str, conn=Depends(get_db)):
    session = provider.start(user)
    cur = conn.execute("UPDATE users SET verification_ref = ? WHERE id = ?", (session.session_id, user))
    if cur.rowcount == 0:
        return JSONResponse(status_code=404, content={"error": "unknown_user"})
    conn.commit()
    return {"session_id": session.session_id, "url": session.url}


@router.get("/verify/mock/{session_id}", response_class=HTMLResponse)
def verify_mock_page(session_id: str, returnTo: Optional[str] = None):
    html = (MOCK_PAGE
            .replace("__SESSION_ID__", json.dumps(session_id))
            .replace("__RETURN_TO__", json.dumps(_safe_return_to(returnTo))))
    return HTMLResponse(html)


@router.post("/verify/webhook", response_model=schemas.OkResponse)
def verify_webhook(body: schemas.VerifyWebhook, conn=Depends(get_db)):
    session_id, verified = provider.parse_webhook(body.model_dump())
    row = conn.execute("SELECT id FROM users WHERE verification_ref = ?", (session_id,)).fetchone()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "unknown_session"})
    if verified:
        conn.execute(
            "UPDATE users SET verified = 1, verified_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"), row["id"]),
        )
        conn.commit()
    return {"ok": True}
