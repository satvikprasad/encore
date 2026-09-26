# Encore — Devpost (paste-ready)

<!-- Source: DESIGN.md §14, adjusted to what shipped. Check the TODOs before submitting. -->

**Track:** Oracle of the Deep
**Challenges:** Meta · SpaceXAI · Notability
**Create-X:** check the interest box on the submission form
**Video:** <!-- TODO: YouTube unlisted link -->
**Repo:** https://github.com/satvikprasad/encore

## Inspiration

Live music is the most social thing we do, and the tools for it are the least social. Discovery lives in Spotify, tickets in Ticketmaster, memories in the Notes app, and "anyone going?" dies in a group chat. We wanted the Beli experience for concerts — where ranking your history is the *means*, and finding people to go with is the *point*.

## What it does

Encore turns your concert history into a way to find your people. Logging is nearly effortless: import your camera roll and Encore reads each photo's location and timestamp on-device, matches it against venue geofences and event schedules, and asks you to confirm the shows it found. Then you review each show on seven structured dimensions — music, crowd, venue, accessibility, production, value, would-attend-again — and rank them through quick pairwise comparisons. A Bayesian model learns both how good each show was *and* what you personally care about. That taste profile powers the social layer: for any upcoming event, Encore finds people within two hops of your network who are interested and scores your compatibility from real overlap in your histories. AI explains each match with reasons grounded in shows you've both seen, drafts an icebreaker, and — once you form a crew — reads your chat and proposes a plan that respects everyone's budget and accessibility needs. Every feature that connects you with someone outside your friends requires ID verification, so the people you match with are real people who were really there.

## How we built it

Next.js frontend styled as a phone; FastAPI backend in Python with SQLite. Photo matching runs client-side with `exifr` so raw images never leave the phone; the server receives only coordinates and timestamps and scores them against a geofence-plus-time-window model, aggregating confidence across a night's photos with a noisy-OR. The ranker is a multi-dimensional Bradley–Terry model with a particle posterior over your preference weights and information-gain question selection, so three comparisons carry as much information as ten random ones. Matching blends Spearman rank correlation on shared shows with cosine similarity of learned preference weights. Group planning solves a small welfare-with-fairness optimization under hard budget and accessibility constraints. Grok (via SpaceXAI credits) turns the numbers and the chat transcript into human language; every call is capped at 6 seconds, validated against the input (it must cite only shows both people saw and name the binding budget and needs), and falls back to a deterministic template so the demo never hangs. ID verification is built behind a provider interface — mocked for the demo, designed for Stripe Identity or Persona in production. Event data comes from the Ticketmaster Discovery and Setlist.fm APIs through a cached, deterministic seed <!-- TODO: if the demo DB was seeded without API keys, say "with a synthetic fallback for the demo" -->. We planned and tracked the build in Notability Pro.

## Challenges we ran into

Making the AI *essential* rather than decorative: every explanation is grounded in structured data the model is handed, and outputs that cite anything else are thrown away in favour of a template. Getting attendance detection confident without being wrong: single photos near multi-room venues are ambiguous, so we aggregate evidence across a night and surface uncertain matches as questions rather than facts. Getting an interpretable ranking from three questions: a single online gradient step barely moved the model, so we switched to a proper posterior over preference weights and pick the question with the highest expected information gain. And seeding a believable social graph, deterministically, in one night.

## Accomplishments that we're proud of

Camera-roll import that recovers a concert history in seconds. A ranking model that visibly learns what you value after three taps. Match explanations that reference specific shows two people saw. A plan-synthesis flow that turns a messy chat into a night out everyone can attend.

## What we learned

Structured input beats stars: seven numbers plus tags let a model separate "great band, bad room" from "great room, band phoned it in," which is exactly what a friend would tell you. And friction, not features, is what kills logging apps — the photo import changed the product.

## What's next for Encore

Universal event resolution across ticketing sources, including DIY and rave shows with no official listing; opt-in night-of features (live set times, crew locator) with differential privacy; production ID verification and reputation for stranger matching; partner checkout. And a Create-X application.

**Built with:** Next.js, React, Tailwind CSS, Recharts, exifr, FastAPI, Python, NumPy, SciPy, SQLite, Ticketmaster Discovery API, Setlist.fm API, Grok, Cursor, Notability
