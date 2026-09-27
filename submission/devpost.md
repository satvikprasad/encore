# Encore — Devpost

**Tagline:** Beli for concerts — rank the shows you've seen, find fans with your taste, and go together.

## Inspiration
Everyone remembers the best show they've ever seen, and nobody keeps track of the rest. Beli made restaurant-going social and competitive by making *ranking* the core loop; Bandsintown and Songkick only tell you what's coming. We wanted the loop for live music: log a show, rank it against your own history, see what your friends thought, and use that taste graph to find the right people to go with next.

## What it does
- **Log & rank:** search a show (or add one that isn't listed), tap *I went*, rate seven dimensions (music, crowd, venue, accessibility, production, value, would-again), then answer a few "better or worse than…?" questions. Shows land in a tiered ranking; the app learns what you actually care about.
- **For you:** upcoming shows scored by friends going (weighted by taste match), verified fans like you, artists/venues you've seen, related artists and genre — with the reasons shown.
- **Real shows and prices:** 422 upcoming shows at seven Atlanta venues scraped from the venues' own sites, ~550 real past shows, direct Ticketmaster/AXS/Eventbrite links, and live resale price comparison.
- **Fans like you:** verified people within two hops with a taste match, an explanation and an icebreaker — gated behind ID verification because it connects strangers.
- **Crews:** group chat per show and a one-tap plan that respects everyone's budget and accessibility needs.
- **Moments:** photos and videos attached to shows, shared with followers, on a home feed.

## How we built it
Next.js 14 + Tailwind + Recharts in a phone frame; FastAPI + SQLite; NumPy/SciPy for the ML. Ranking is a multi-dimensional Bayesian Bradley–Terry model with a particle posterior over preference weights and information-gain pair selection; taste match is Spearman-on-shared-shows blended with cosine similarity of weights; the group planner maximizes total fit minus variance under budget/access constraints. Data comes from keyless scrapers of venue websites (Live Nation JSON-LD, the AEG calendar feed, WordPress cards) plus Wayback Machine replays for history, MusicBrainz + Deezer for genres/related artists/pictures, Gametime + Eventbrite for prices, Nominatim for geocoding. Grok writes match explanations and crew plans through an OpenAI-compatible client with a 6-second cap and deterministic fallbacks. The seed is byte-identical every run and the demo path is a test.

## Challenges we ran into
- Every ticketing site blocks servers (Ticketmaster 401, AXS/SeatGeek/StubHub 403), so prices had to come from the few sources that publish them, with keyed adapters ready for the rest.
- No venue publishes an archive and setlist.fm/Songkick block scraping; we replayed Wayback Machine snapshots through the same parsers — and got rate-limited doing it.
- Photo-based show detection (EXIF time + GPS → show) was unreliable without complete past-show data, so we removed it rather than ship something flaky.
- Keeping a scraped, deterministic, tested seed while the product changed under us.

## Accomplishments that we're proud of
Real data with zero API keys; a ranking model that visibly learns from three taps; a taste match that produces sensible strangers; a full social loop (follow → moments → fans like you → crew → plan) that works end to end in under four minutes; 82 passing tests including the demo itself.

## What we learned
Scrapers are a product decision, not just plumbing; determinism makes a demo survivable; users forgive a missing feature faster than a wrong one.

## What's next for Encore
Reliable photo-based logging — detecting the show and venue from photo metadata — which needs a complete history of past shows (we could not scrape venue archives reliably; setlist.fm access fixes that). More cities via venue adapters or Ticketmaster's city feed, hosted media storage, and a real identity provider behind the existing verification interface.

## Generative AI
Yes. Grok (xAI, via its OpenAI-compatible API) writes the two-sentence "why you match" explanation plus an icebreaker for each fan match, and turns a crew's chat into a plan (option, meeting time, per-person notes) — constrained to only cite shows in the input and validated before use. Every call has a 6-second cap and a deterministic template fallback, so the product never depends on the model being up. Everything else (ranking, taste matching, recommendations, planning constraints) is classical ML/statistics.
