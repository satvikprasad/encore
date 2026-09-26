# Encore

Rank the shows you've been to, find verified fans with your taste who are going to the next one, and plan the night together. Built at HackGT 13.

> **Verification is mocked.** The identity check is a served mock page that auto-approves after 3 seconds. In production this would be Stripe Identity or Persona behind the same `VerificationProvider` interface (`api/app/verify/provider.py`).

## Setup

Requires Python 3.11+, Node 20+, pnpm, and (for seeding only) `exiftool`.

```bash
cp .env.example .env               # fill in API keys; the app runs without GROK_API_KEY (template fallbacks)
python3 -m venv api/.venv && source api/.venv/bin/activate
pip install -r api/requirements.txt
(cd web && pnpm install)

make seed         # rebuild data/encore.db deterministically (seed 1313) + demo photos
make dev          # API on :8000, web on :3000
make test         # API test suite
make demo-reset   # before every run-through
```

The frontend reads canned responses from `fixtures/` while `NEXT_PUBLIC_USE_FIXTURES=true`.

## Architecture

```
 Browser (Next.js 14, phone frame)
 ├─ exifr reads GPS + time from photos locally ── only {lat,lng,captured_at} leave the device
 └─ fetch ─────────────────────────────┐
                                       ▼
 FastAPI  (api/app)
 ├─ gate.py            403 verification_required on matches / crews with non-friends
 ├─ routers/           media · reviews · compare · rank · events · matches · verify · crews
 ├─ ml/                matcher (geofence + time window → event)
 │                     ranker  (multi-dim Bradley–Terry, info-gain pair selection)
 │                     taste   (user–user match %)   group (crew option scoring)
 ├─ ai/                Grok via OpenAI-compatible API; 6 s cap, deterministic fallback on every call
 └─ verify/            provider interface + mock
                                       │
                                       ▼
 SQLite  data/encore.db  ◀── seed/ (Ticketmaster Discovery, Setlist.fm, hand-written demo data)
```

Contract: `api/app/schemas.py` ↔ `web/src/types.ts` ↔ `fixtures/*.json`. See `AGENTS.md`.

## Team

<!-- TODO: names + roles -->
- M1: Data & event graph
- M2: Ranking, matching & ML
- M3: Frontend
- M4: Skeleton, AI, trust & submission
