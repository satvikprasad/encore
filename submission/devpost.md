# Encore — Devpost draft

<!-- Adjust to what actually shipped before submitting. Source: DESIGN.md §14 (not in repo at time of drafting). -->

**Track:** Oracle of the Deep
**Challenges:** Meta · SpaceXAI · Notability
**Built with:** Python, FastAPI, SQLite, NumPy, SciPy, Next.js, React, Tailwind CSS, Recharts, exifr, Grok (xAI), Ticketmaster Discovery API, Setlist.fm API, Notability
**Video:** <!-- TODO: unlisted link -->
**Create-X:** ☐ checked on the submission form

## Inspiration

You remember the great show, but not the fifteen before it. Ticket apps know what you bought; nobody knows what you thought of it. And the people with exactly your taste are standing next to you at the show as strangers.

## What it does

- **Import your concert history from your camera roll.** Encore reads GPS and time from photo metadata on the device, matches them to venue geofences and event windows, and finds the shows you went to. Only coordinates and timestamps leave the phone.
- **Rank shows the way you actually feel about them.** Rate a show across music, crowd, venue, accessibility, production and value, then answer a few "better or worse than…?" questions. A multi-dimensional Bradley–Terry model picks the most informative comparison each time and learns what you care about.
- **Find verified fans with your taste who are going.** For an upcoming show, Encore ranks people within two hops of your friends by taste match and explains why you match, with an icebreaker grounded in shows you both went to. Matches are only visible to identity-verified users.
- **Plan the night as a crew.** Chat with your crew and get a plan that respects everyone's budget and accessibility needs, scored per member, with the trade-off explained.

## How we built it

- **Backend:** FastAPI + SQLite. Photo matching uses haversine geofences, event time windows, per-night clustering and noisy-OR confidence. Ranking is a Bradley–Terry model over 7-dimensional show vectors with per-user preference weights and information-gain pair selection (NumPy/SciPy).
- **AI:** Grok writes match explanations and crew plans. Every call is capped at 6 seconds, validated (must cite only shows in its input, must name the binding budget and needs), and falls back to a deterministic template, so the app never hangs.
- **Trust:** a verification gate on anything that exposes you to non-friends. For the hackathon, verification is a mock provider behind a real interface; production would use Stripe Identity or Persona.
- **Frontend:** Next.js 14, Tailwind and Recharts in a phone frame; EXIF parsing in the browser with exifr.
- **Data:** Ticketmaster Discovery for upcoming Atlanta shows, Setlist.fm for past shows, plus a deterministic demo seed.
- **Planning:** we planned in Notability (screenshots in `submission/notability/`).

## Challenges we ran into

<!-- TODO: fill in honestly after the build -->

## Accomplishments that we're proud of

<!-- TODO -->

## What we learned

<!-- TODO -->

## What's next for Encore

- Real identity verification (Stripe Identity / Persona)
- Ticket-stub evidence alongside photos
- Venue accessibility data contributed by verified attendees
