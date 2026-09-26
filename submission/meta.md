# Encore — Meta challenge write-up (paste-ready)

<!-- Source: DESIGN.md §15. -->

**Who it's for.** People who love live music but end up going alone or not at all — because their close friends don't share the taste, and the wider network of people who do is invisible. Also the crews who already go together but lose an hour of every group chat to logistics.

**How it strengthens connection.** Encore surfaces second-degree connections with demonstrable taste compatibility — not "you both like this artist" but "you both ranked the same shows highly and cared about the same things." It gives them a shared, low-stakes reason to talk (a specific show they both saw) and a concrete plan to meet in person. Every match ends at a real venue on a real night.

**Why AI is essential.** The structured data can tell you *that* two people match. Only a language model can turn fourteen preference numbers and a chat thread into a reason to text someone, and into a plan that names who's compromising and why it's still worth it. We ground every generation in the structured record — and reject any output that cites a show the two people didn't share — so the AI explains rather than invents.

**Trust.** Bringing people closer means putting them in the same room, so safety is part of the product, not a footer. Encore gates every stranger-facing feature — seeing matches, starting or messaging a crew with non-friends — behind ID verification, and photo-evidenced attendance means the person you're matched with demonstrably goes to shows. AI writes the introduction; verification makes it safe to send. Verification is mocked in this prototype behind a real provider interface; production would use Stripe Identity or Persona.

**Privacy.** Photos never leave the device: the browser extracts only coordinates and a timestamp from each photo and sends those.
