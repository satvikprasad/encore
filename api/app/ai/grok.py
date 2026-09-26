"""Grok chat client (OpenAI-compatible, plain httpx). Every call takes a fallback
and returns it on any failure or after 6 s total, so the demo never hangs."""
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Callable, Optional, TypeVar

import httpx
from dotenv import load_dotenv

from ..db import REPO_ROOT

load_dotenv(REPO_ROOT / ".env")
log = logging.getLogger("encore.grok")

TIMEOUT_S = 6.0
TEMPERATURE = 0.4
MAX_TOKENS = 300

T = TypeVar("T")
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="grok")


def _config() -> Optional[tuple[str, str, str]]:
    key = os.environ.get("GROK_API_KEY", "").strip()
    if not key:
        return None
    base = os.environ.get("GROK_BASE_URL", "https://api.x.ai/v1").rstrip("/")
    return key, base, os.environ.get("GROK_MODEL", "grok-4.20-0309-non-reasoning")


def _post(messages: list[dict], json_mode: bool) -> str:
    key, base, model = _config()
    body = {"model": model, "messages": messages, "temperature": TEMPERATURE, "max_tokens": MAX_TOKENS}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(f"{base}/chat/completions", json=body,
                   headers={"Authorization": f"Bearer {key}"}, timeout=TIMEOUT_S)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def chat(messages: list[dict], fallback: T, parse: Callable[[str], T] = lambda s: s,
         json_mode: bool = False, timeout: Optional[float] = None) -> T:
    """Run a chat completion and return parse(content), or `fallback` if there is no
    API key, the request fails, it takes longer than `timeout`, or parse raises."""
    if _config() is None:
        return fallback
    timeout = TIMEOUT_S if timeout is None else timeout
    future = _pool.submit(_post, messages, json_mode)
    try:
        return parse(future.result(timeout=timeout))
    except FutureTimeout:
        log.warning("grok timed out after %.1fs; using fallback", timeout)
    except Exception as e:  # network, HTTP status, malformed body, parse/validation
        log.warning("grok failed (%s: %s); using fallback", type(e).__name__, e)
    return fallback


def parse_json_object(content: str) -> dict:
    """Parse a JSON object, tolerating ```json fences around it."""
    s = content.strip()
    if s.startswith("```"):
        s = s.strip("`").removeprefix("json").strip()
    obj = json.loads(s)
    if not isinstance(obj, dict):
        raise ValueError("expected a JSON object")
    return obj
