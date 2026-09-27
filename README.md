# Encore

**Beli for concerts.** Log the shows you've been to, rank them with a few "better or worse than…?" taps, find verified fans with your taste who are going to the next one, compare ticket prices, and plan the night together. Built at HackGT 13.

> **Verification is mocked.** The identity check is a served mock page that auto-approves after 3 seconds. In production this would be Stripe Identity or Persona behind the same `VerificationProvider` interface (`api/app/verify/provider.py`). But costs money :(

## Setup

Requires Python 3.11+ and Node 20+ (pnpm via `npx pnpm@9` is fine). No API keys are needed to run the full demo.

```bash
cp .env.example .env               # optional keys; everything runs without them (see below)

# API (terminal 1)
cd api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# Web (terminal 2)
cd web && npx --yes pnpm@9 install && npx --yes pnpm@9 dev      # http://localhost:3000
```

Other commands (from the repo root, with `api/.venv` activated):

```bash
make test         # API test suite (82 tests), including the full demo run-through
make demo-reset   # demo user back to the start of the run-through
make seed         # rebuild data/encore.db + data/media from the committed caches — byte-identical every run
```

- **Demo user:** the app opens as Artem Kim; switch to **Jasmine Liu** at the bottom of the You tab to demo (her friends' moments and matches are set up for it).
- **Frontend data:** the web app talks to the real API. To demo on canned `fixtures/`, put `NEXT_PUBLIC_USE_FIXTURES=true` in `web/.env.local`.
- **Optional keys** (`.env`): `TICKETMASTER_API_KEY` adds face-value prices for Ticketmaster-sold shows, `SEATGEEK_CLIENT_ID` adds SeatGeek resale prices, `SETLISTFM_API_KEY` backfills real past shows at all seven venues on the next seed, `GROK_API_KEY` turns on AI-written match explanations and crew plans (there are deterministic templates without it). `MEDIA_STORAGE=supabase` + `SUPABASE_*` moves photo/video storage to a hosted bucket.

## What's real

- **Upcoming shows** — 422 real shows at seven Atlanta venues, scraped from the venues' own websites (Live Nation JSON-LD, the AEG feed, WordPress cards, the arena's list) with direct **Ticketmaster / AXS / Eventbrite** links, posters, doors and support acts. No keys. Cached in `data/cache/venues/`.
- **Past shows** — ~550 real shows replayed from the Wayback Machine's copies of four venue calendars. Anything else (any artist, any venue, any date) can be added from **Log a show**; artists autocomplete from Deezer and unknown venues are geocoded.
- **Tickets** — every show links to the seller's page for that exact show; **Gametime** resale prices and Eventbrite face value are fetched live (no keys), Ticketmaster/SeatGeek prices with keys.
- **Artists** — genre tags from MusicBrainz, related artists and pictures from Deezer, for every upcoming artist (`data/cache/music/`).
- **Photos & videos** — uploaded to the API (local disk by default, Supabase optional) and shared with the people who follow you. `demo_photos/` holds the team's own concert photos, seeded as friends' moments via `seed/demo_media.json`.

## How it works

- **Ranking** — each show gets a 7-dimension review (music, crowd, venue, accessibility, production, value, would-again). A multi-dimensional Bayesian **Bradley–Terry** model with a particle posterior over your preference weights turns "better or worse than X?" answers into a ranked list with tiers; each next pair is chosen by expected information gain. Your weights ("what you care about") are the posterior mean.
- **Taste match** — Spearman correlation over shows two people both ranked, blended with cosine similarity of their preference weights.
- **For you** — friends going (weighted by taste match), verified fans within two hops, artists and venues you've been to, Deezer related artists, genre overlap — with the two strongest reasons shown.
- **Fans like you** — verified users within two follow hops who are going to a show, with an explanation and an icebreaker (Grok, or a template). Behind a verification gate because it connects strangers.
- **Crews** — group chat per show; "Make a plan" scores the show's price tiers against everyone's budget and accessibility needs (`ml/group.py`) and writes the plan (Grok, or a template).

## Architecture

```
 Browser (Next.js 14 + Tailwind + Recharts, phone frame)
 ├─ Home: friends' moments · For you    Search: shows / people    Log a show: search or add
 ├─ Show page: poster, marks, tickets & prices, photos, access, fans like you, crews
 └─ fetch ───────────────────────────────────────┐
                                                 ▼
 FastAPI  (api/app)
 ├─ gate.py        403 verification_required on matches / crews with non-friends
 ├─ routers/       attendance · reviews · compare · rank · events · matches · verify · crews · people · gallery
 ├─ ml/            ranker (Bradley–Terry + info gain) · taste · group · recommend
 ├─ tickets.py     Gametime / Eventbrite (keyless) · Ticketmaster / SeatGeek (keys), 5 s cap, cached
 ├─ artists.py     Deezer lookup · Nominatim geocoding for user-added shows
 ├─ storage.py     photo/video bytes: local disk (served at /media-files) or Supabase Storage
 ├─ ai/            Grok via OpenAI-compatible API; 6 s cap, deterministic fallback on every call
 └─ verify/        provider interface + mock
                                                 │
                                                 ▼
 SQLite  data/encore.db  ◀── seed/ (fetch_venues: venue sites + Wayback · fetch_music: MusicBrainz + Deezer
                                     · demo_users / demo_events / demo_media)
```

Contract: `api/app/schemas.py` ↔ `web/src/types.ts` ↔ `fixtures/*.json`. See `AGENTS.md` for the schema, endpoints and data sources.

## Team

Artem Kim · Jasmine Liu · Satvik Prasad · Ayush Shah — HackGT 13.
