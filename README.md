# Encore

Rank the shows you've been to, find verified fans with your taste who are going to the next one, and plan the night together. Built at HackGT 13.

> **Verification is mocked.** The identity check is a served mock page that auto-approves after 3 seconds. In production this would be Stripe Identity or Persona behind the same `VerificationProvider` interface (`api/app/verify/provider.py`).

## Setup

Requires Python 3.11+, Node 20+, pnpm (or `npx pnpm@9`), and, for seeding only, `exiftool` (`brew install exiftool`).

```bash
cp .env.example .env               # add API keys; everything runs without them (see below)
python3 -m venv api/.venv && source api/.venv/bin/activate
pip install -r api/requirements.txt Pillow   # Pillow is only needed for `make seed`
(cd web && pnpm install)

make dev          # API on :8000, web on :3000
make test         # API test suite, including the full demo run-through
make demo-reset   # before every run-through
make seed         # only to rebuild data/encore.db + demo photos (committed; byte-identical every run)
```

- **Frontend data:** the web app talks to the real API by default. To demo on canned `fixtures/`, put `NEXT_PUBLIC_USE_FIXTURES=true` in `web/.env.local` (Next.js only reads env files inside `web/`).
- **Grok:** set `GROK_API_KEY`. The default model is `grok-4.20-0309-non-reasoning` (~1 s; `grok-4` takes ~5 s against the 6 s cap). With no key, or on any error or timeout, every AI call returns a deterministic template.
- **Event data:** upcoming shows are real — `seed/fetch_venues.py` scrapes the seven venues' own sites (no keys) into `data/cache/venues/`, with direct Ticketmaster / AXS / Eventbrite links. With `TICKETMASTER_API_KEY` (face-value prices, genres) and `SEATGEEK_CLIENT_ID` (resale prices) the show page compares prices across sellers; without them prices show as "not published". Past shows come from `SETLISTFM_API_KEY` when set, otherwise the documented synthetic fallback (`source='demo'`).
- **Demo script:** `submission/video_script.md` has the exact taps and answers; `api/tests/test_demo_flow.py` checks the same path.

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
