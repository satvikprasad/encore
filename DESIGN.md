# Encore — HackGT 13 Build Doc

*"Beli meets Ticketmaster, but the point is who you go with."*
*Track: Oracle of the Deep · Sponsor challenges: Meta, SpaceXAI, Notability, Create-X · Team of 4*
*Hacking ends Sun 8:00 AM · Expo 9:00–11:15 AM · Submit by 7:00 AM · Feature freeze 2:00 AM*

---

## 1. Pitch

Live music is the most social thing we do, and the tools for it are the least social. Discovery lives in Spotify, tickets in Ticketmaster, memories in the Notes app, and "anyone going?" dies in a group chat.

**Encore turns your concert history into a way to find your people.** Drop in your camera roll and Encore figures out which shows you've been to. Review them with seven structured scores instead of stars, rank them two at a time, and let AI match you — safely, behind ID verification — with people in your extended network who'll love the same night, then plan it together.

## 2. Judging targets

| Target | Why we fit | Requirements |
|---|---|---|
| **Track: Oracle of the Deep** (ML/AI + visualization) | Bayesian multi-dimensional ranking, photo→event matching, graph-based taste matching; radar cards and preference bars as the visuals | Submit to this one track only |
| **Meta: Bringing People Closer Together with AI** (top 3 → Menlo Park, travel paid) | Their brief literally names "identify common interests that could spark a new connection" and "synthesize a group discussion into plans" | Working prototype, **2–3 min video**, public repo, write-up on who it's for / how it strengthens connection / why AI is essential. Judged on connection, AI essentiality, originality, demo strength |
| **SpaceXAI** | Free Cursor + Grok credits for all; we use Grok as our LLM | Build with Cursor, use Grok |
| **Notability** | Free win | Plan in Notability Pro, tag on Devpost, 2 screenshots |
| **Create-X** | Check the box at submission | Nothing |

## 3. Scope

### In scope — must work on stage
1. **Photo import → auto-detected shows.** Upload camera-roll photos; Encore reads location + timestamp on-device, matches to venue and event window, and asks you to confirm. "You were at 6 shows."
2. **Structured review** — seven dimensions with tag chips.
3. **Pairwise ranking** — three "better or worse than ___?" questions, chosen by information gain; live-updating tiered list.
4. **Visuals** — radar review card and "what you care about" preference bars that visibly update after the comparisons.
5. **Event pages** — real upcoming Atlanta events, venue accessibility panel, friends interested, taste-match %.
6. **ID verification gate** — matching, open crews, and any contact with non-follows is locked until the user verifies. Verification is a mocked provider behind a real interface.
7. **AI match explanation + icebreaker** — grounded in shows both people have seen.
8. **Crew chat → "Make a plan"** — AI reads the thread and proposes a concrete plan respecting everyone's budget and accessibility needs.

### Out of scope — roadmap only
Multi-source event resolution, night-of sensing, real ticket checkout, real KYC, native mobile, stranger-safety systems beyond the gate. Mention in the write-up; don't build.

## 4. Architecture

```
Ticketmaster Discovery (upcoming ATL) ──┐
Setlist.fm (past 2 yrs, 7 ATL venues)  ──┼──► seed.py ──► SQLite (events, venues, artists, users, reviews)
Synthetic users + reviews               ──┘
                                                    │
Next.js web app (phone-shaped)  ◄──►  FastAPI (matcher, ranker, taste match, group scorer, verify)  ◄──►  Grok API
     │
     └── exifr runs client-side: photos never leave the browser; only (lat, lng, t) go to the API
```

Single repo, two services (`web/`, `api/`). No auth — a user switcher on load. One `make dev` starts both.

## 5. Data model

```
User(id, name, avatar, home_city, budget_max, accessibility_needs[],
     verified: bool, verified_at, verification_ref)
Artist(id, name, tm_id, genres[])
Venue(id, name, tm_id, lat, lng, geofence_radius_m, multi_room: bool,
      access_profile{step_free, ada_seating, quiet_room, strobe_policy})
Event(id, artist_id, venue_id, start_at, doors_at?, price_min, price_max, tm_url, is_past)
MediaItem(id, user_id, captured_at, lat, lng, matched_event_id?, confidence)
Attendance(user_id, event_id, status: interested|going|attended,
           evidence: photo|ticket|manual, confidence)
Review(user_id, event_id, music, crowd, venue, accessibility, production, value ∈ 1..5,
       would_again: bool, tags[], price_paid)
Comparison(user_id, event_a, event_b, winner)
Follow(follower_id, followee_id)
Crew(id, event_id, member_ids[], messages[{user_id, text, at}], plan?)
```

**Seed targets:** ~150 upcoming Atlanta events; ~400 past events (2 years) at Tabernacle, The Eastern, Variety Playhouse, Terminal West, State Farm Arena, Coca-Cola Roxy, Masquerade; ~40 artists; 30 synthetic users with 8–25 attended shows each, reviews drawn from per-user taste personas (Production person, Crowd person, Value hawk, etc.) so the models have signal.

**Hero demo user "Sam":** 12 attended shows, 6 of them photo-evidenced (added live during the demo), clear Production-heavy profile, unverified at demo start, two friends-of-friends interested in the same upcoming show.

## 6. Structured review

| Dimension | 1–5 question | Tags |
|---|---|---|
| Music | How was the performance? | tight, sloppy, deep cuts, played the hits, guest appearance |
| Crowd | Energy and vibe? | mosh, chill, singalong, phone-heavy, rowdy |
| Venue | How was the room? | great sound, muddy, good sightlines, long bar lines |
| Accessibility | Did the venue work for you? | ADA honored, strobes, interpreter, re-entry allowed, quiet space |
| Production | Lights, visuals, staging? | lasers, LED wall, pyro, minimal, mix too loud |
| Value | Worth what you paid? | worth it, overpriced, fees hurt |
| Would attend again | yes/no | for this artist / this venue / both |

Also: price paid, section/GA. One screen per dimension, tap a number, tap chips, next. Target: 60 seconds.

## 7. Models

### 7.1 Photo → event matching
For each media item with $(\text{lat}, \text{lng}, t)$:

1. **Venue candidates:** venues with $d_v = \text{haversine}(\text{photo}, \text{venue}) \leq r_v$. Default $r_v = 150$ m; larger for amphitheaters and arenas.
2. **Event candidates:** events at those venues with $t \in [\text{doors} - 30\text{m},\ \text{doors} + 6\text{h}]$; if doors unknown, $[\text{start} - 2\text{h},\ \text{start} + 5\text{h}]$.
3. **Per-photo score:** $c = \exp(-d_v / r_v)\cdot \mathbb{1}[t \in \text{window}]\cdot p_v$, where $p_v = 0.6$ for multi-room venues (Masquerade), else $1$.
4. **Aggregate per night:** cluster photos by (venue, date); attendance confidence $= 1 - \prod_k (1 - c_k)$. Three photos at one place beats one.
5. **Thresholds:** $\geq 0.8$ → pre-checked "attended," one tap to confirm; $0.4$–$0.8$ → "Were you at ___?" card; $< 0.4$ → ignore.

**Client side:** `exifr` extracts GPS and `DateTimeOriginal` in the browser. Only coordinates and timestamps are sent to `/media/match`. Say this out loud in the demo — it's a privacy point.

**Gotchas:**
- iPhone photos lose GPS through AirDrop and messaging apps. Use originals; Safari's picker with "Actual Size" preserves EXIF.
- `.mov` GPS lives in QuickTime atoms and `exifr` won't read it. Skip video for the demo; say "photos" unless `mediainfo.js` works by freeze.
- Build a **demo photo set** of 8–10 JPEGs with EXIF at real venues on real past show dates. Fabricate if needed:
  `exiftool -GPSLatitude=33.7596 -GPSLatitudeRef=N -GPSLongitude=84.3899 -GPSLongitudeRef=W -DateTimeOriginal="2026:03:14 22:10:00" photo.jpg`

### 7.2 Multi-dimensional Bayesian ranking
Each show $i$ for user $u$ has latent quality $\boldsymbol{\theta}_i \in \mathbb{R}^7$, initialized to the user's review scores with prior variance $\sigma_0^2$. The user has a preference weight vector $\mathbf{w}_u \in \mathbb{R}^7$, initialized uniform, $\|\mathbf{w}_u\|_1 = 1$. Scalar preference is $s_i = \mathbf{w}_u \cdot \boldsymbol{\theta}_i$ and
$$P(i \succ j) = \sigma\!\left(\frac{s_i - s_j}{\beta}\right), \qquad \beta = 1.$$

**Update** after each comparison with outcome $y \in \{0,1\}$: one gradient step on $\mathbf{w}_u$, $\boldsymbol{\theta}_i$, $\boldsymbol{\theta}_j$ toward $y$ (learning rate $\eta = 0.3$), then renormalize $\mathbf{w}_u$ and shrink both shows' variance by a factor of $0.8$. About twenty lines of NumPy; no full ADF.

**Question selection:** over candidate pairs $(i,j)$, maximize
$$H\big(P(i \succ j)\big)\cdot \frac{1}{\text{rank}_i + \text{rank}_j}\cdot \big(1 + \|\boldsymbol{\theta}_i - \boldsymbol{\theta}_j\|_{\text{argmax } \text{Var}(\mathbf{w}_u)}\big),$$
i.e. uncertain outcome, near the top of the list, differing most along the dimension where we know least about the user's weights. The new show is always in the first comparison.

**Display:** tiers S/A/B/C by quantile of $s_i$; radar card of $\boldsymbol{\theta}_i$ per show; bar chart of $\mathbf{w}_u$ labelled "what you care about," animated after each answer.

### 7.3 Taste match
For users $u,v$ with $k$ shows in common:
$$m(u,v) = \alpha\,\rho_{\text{Spearman}}(\text{ranks}_u, \text{ranks}_v) + (1-\alpha)\cos(\mathbf{w}_u, \mathbf{w}_v), \qquad \alpha = \min(1, k/8),$$
mapped to $[0,100]$. Candidates for an event = users within 2 follow hops who are `interested`/`going`, **filtered to `verified = true`**. Sort by $m$.

### 7.4 Group plan scorer
For crew $C$ and candidate options $e$ (event × price tier/section):
$$\max_e \sum_{u \in C} \hat{s}_u(e) - \lambda\,\mathrm{Var}_{u \in C}\big[\hat{s}_u(e)\big]
\quad\text{s.t.}\quad \text{price}(e) \leq \min_u \text{budget}_u,\ \ \text{venue}(e) \models \bigcup_u \text{needs}_u,$$
with $\hat{s}_u(e) = \mathbf{w}_u \cdot \bar{\boldsymbol{\theta}}_{\text{artist}(e)}$ (population-mean review vector for the artist) and $\lambda = 0.5$. Return top 3 with per-member scores; the LLM writes the tradeoff sentence.

## 8. AI layer (Grok via Cursor/SpaceXAI credits)

Both prompts are grounded in structured data so the model explains rather than invents. Prompt constraint in both: *cite only shows and facts present in the input.*

**Match explanation.** Input: both users' top-5 shows, both $\mathbf{w}$ vectors, shared shows with each one's tags, the target event. Output: two sentences on why they'd enjoy it together, one icebreaker referencing a specific shared show.

**Plan synthesis.** Input: crew chat transcript, each member's budget/needs/arrival, top-3 options from §7.4 with per-member scores. Output: a plan card — which option, when and where to meet, why it works for each named person, and one line on who's compromising. "Adopt plan" pins it to the crew.

**Why AI is essential** (Meta's criterion, verbatim for the write-up): structured data tells you *that* two people match; only a language model turns fourteen preference numbers and a chat thread into a reason to text someone, and into a plan that names who's compromising and why it's worth it.

## 9. Trust: ID verification gate

**Rule.** Any feature that exposes you to, or lets you contact, someone outside your direct follows requires `verified = true`: taste matches on event pages, open crews, joining a crew containing a non-follow. Logging, ranking, and friend-only crews stay open. Verification is the price of meeting strangers, not of using the app.

**Implementation.** `VerificationProvider` interface: `start_session(user) → {url}` and webhook `on_verified(ref)`. Ship `MockProvider`: a realistic "scan your ID, take a selfie" screen that returns verified after ~3 s. README and write-up state plainly that production uses Stripe Identity or Persona and the vendor is mocked for the demo. Gate enforced as FastAPI middleware on `/matches/*`, `/crews/*/join`, `/crews/open`.

**Signals shown.** Verified badge on profiles and match cards. "Was there" marker on attendances with `evidence = photo` — not identity, but evidence the person is a real concert-goer, and it ties import and matching together in the pitch.

**Stretch only after the core demo works end-to-end:** Stripe Identity test mode with fake documents, ~2 hours. Not before freeze.

## 10. Screens (build in this order)

1. **Home** — user switcher, "Import from camera roll," "Log a show," friends feed
2. **Import** — file picker → on-device EXIF progress → "We found 6 shows" list with confidence chips → confirm/dismiss each
3. **Review** — 7 screens, one dimension each
4. **Compare** — 3 questions, then reveal
5. **Ranked list** — tiers, radar card on tap, preference bars
6. **Event page** — lineup, venue Access panel, price range, friends interested; match section shows **locked state: "Verify to see who's going"** when unverified
7. **Verify** — mock ID flow → success → returns to event page, matches unlocked
8. **Crew** — members, chat, "Make a plan" → plan card → "Adopt"

Dark theme, phone-width container centered on desktop so the projector shows a phone. Recharts for radar and bars.

## 11. API

```
POST /media/match          {items:[{lat,lng,captured_at}]} → [{event, confidence, cluster_id}]
POST /attendance/confirm   {event_ids[]}
POST /reviews              Review
GET  /compare/next?user=   → {event_a, event_b}
POST /compare              {event_a, event_b, winner} → {ranking, weights}
GET  /rank?user=           → tiers + theta per show + weights
GET  /events?city=Atlanta&upcoming=true
GET  /events/{id}          → event, venue, friends_interested
GET  /matches/{event_id}   [verified only] → [{user, match_pct, explanation, icebreaker}]
POST /verify/start         → {url}      POST /verify/webhook
POST /crews                {event_id, member_ids[]}
POST /crews/{id}/messages  POST /crews/{id}/plan → plan card
```

## 12. Team & timeline

| Time | M1 · Data | M2 · ML | M3 · Frontend | M4 · AI, Trust, Submission |
|---|---|---|---|---|
| **2–4 PM** | TM key; Atlanta upcoming pull; Setlist.fm past events for 7 venues; geofence radii; schema | Ranker skeleton + toy test; photo→event matcher as pure function + tests | Scaffold, screens 1 & 3 | Grok key; `VerificationProvider` + `MockProvider`; repo, README skeleton |
| **4–7 PM** | Synthetic users/personas/reviews; **`seed.py` done by 7 PM**; demo photo set via exiftool | Question selection; `/compare`, `/rank`, `/media/match` | Screen 2 import with `exifr` client-side; screen 4 | `/verify/*`, gate middleware; Notability planning notes + 2 screenshots |
| **7–10 PM** | Venue access profiles; verify demo photos match correct events end-to-end | Taste match `/matches/{event}` with verified filter | Screens 5 & 6 on real API, locked/unlocked match state | Match-explain endpoint; write-up draft |
| **10 PM–2 AM** | Hero user Sam finalized (12 shows, 6 photo-evidenced, unverified) | Group scorer `/plan`; preference-bars payload | Screens 7 & 8; polish, animations | Plan synthesis; Devpost draft; video storyboard |
| **2:00 AM** | **FEATURE FREEZE** — after this, only fixes to things that break the demo | | | |
| **2–5 AM** | Full run-throughs from Sam's story, both laptops | | | **Record video 3–5 AM**, edit |
| **5–7 AM** | Sleep in shifts (2 up, 2 down) | | | **Submit Devpost → expo.hexlabs.org by 7:00 AM** |
| **8–9 AM** | Table setup; laptop A runs demo, laptop B has the video | | | |

## 13. Expo pitch (90 seconds, then demo)

> "Everyone here has a group chat that's just 'anyone going to ___?' with no replies. Encore fixes that — but first it needs to know what you've seen, and nobody logs concerts. So: drop in your camera roll. We read where and when each photo was taken — on your phone, nothing leaves the browser — and match it to real shows. Sam was at six. Confirm, and you're ranking in seconds: seven structured scores instead of stars, two shows at a time, and after three questions the model already knows Sam cares about production more than crowd. That profile powers matching — but matching means meeting strangers, so it's locked until you verify your ID. Sam verifies. Now: two people in Sam's extended network going to this show, 84% and 71% taste match, with reasons grounded in shows they've both seen. Start a crew, argue about seats, hit Make a Plan — the AI reads the thread and proposes the night. Beli meets Ticketmaster, but the point is who you go with — safely."

## 14. Devpost write-up (paste-ready)

**Inspiration**
Live music is the most social thing we do, and the tools for it are the least social. Discovery lives in Spotify, tickets in Ticketmaster, memories in the Notes app, and "anyone going?" dies in a group chat. We wanted the Beli experience for concerts — where ranking your history is the *means*, and finding people to go with is the *point*.

**What it does**
Encore turns your concert history into a way to find your people. Logging is nearly effortless: import your camera roll and Encore reads each photo's location and timestamp on-device, matches it against venue geofences and event schedules, and asks you to confirm the shows it found. Then you review each show on seven structured dimensions — music, crowd, venue, accessibility, production, value, would-attend-again — and rank them through quick pairwise comparisons. A Bayesian model learns both how good each show was *and* what you personally care about. That taste profile powers the social layer: for any upcoming event, Encore finds people within two hops of your network who are interested and scores your compatibility from real overlap in your histories. AI explains each match with reasons grounded in shows you've both seen, drafts an icebreaker, and — once you form a crew — reads your chat and proposes a plan that respects everyone's budget and accessibility needs. Every feature that connects you with someone outside your friends requires ID verification, so the people you match with are real people who were really there.

**How we built it**
Next.js frontend styled as a phone; FastAPI backend in Python. Upcoming Atlanta events come from the Ticketmaster Discovery API; two years of past shows at Atlanta venues from Setlist.fm. Photo matching runs client-side with `exifr` so raw images never leave the phone; the server receives only coordinates and timestamps and scores them against a geofence-plus-time-window model, aggregating confidence across a night's photos. The ranker is a multi-dimensional Bradley-Terry model with entropy-based question selection so three comparisons carry as much information as ten random ones. Matching uses rank correlation on shared shows blended with similarity of learned preference weights. Group planning solves a small welfare-with-fairness optimization under hard constraints. Grok (via Cursor and SpaceXAI credits) turns the numbers and the chat transcript into human language. ID verification is built behind a provider interface — mocked for the demo, designed for Stripe Identity or Persona in production. We planned and tracked the build in Notability Pro.

**Challenges**
Making the AI *essential* rather than decorative: every explanation is grounded in structured data the model is handed, so it reasons about real shared history instead of hallucinating. Getting attendance detection confident without being wrong: single photos near multi-room venues are ambiguous, so we aggregate evidence across a night and surface uncertain matches as questions rather than facts. Getting an interpretable ranking from three questions meant careful question selection, not more math. And seeding a believable social graph in one night.

**Accomplishments**
Camera-roll import that recovers a concert history in seconds. A ranking model that visibly learns what you value after three taps. Match explanations that reference specific shows two people saw. A plan-synthesis flow that turns a messy chat into a night out everyone can attend.

**What we learned**
Structured input beats stars: seven numbers plus tags let a model separate "great band, bad room" from "great room, band phoned it in," which is exactly what a friend would tell you. And friction, not features, is what kills logging apps — the photo import changed the product.

**What's next**
Universal event resolution across ticketing sources, including DIY and rave shows with no official listing; opt-in night-of features (live set times, crew locator) with differential privacy; production ID verification and reputation for stranger matching; partner checkout. And a Create-X application.

**Built with:** Next.js, React, Recharts, exifr, FastAPI, Python, NumPy, SQLite, Ticketmaster Discovery API, Setlist.fm API, Grok, Cursor, Notability

## 15. Meta challenge write-up (paste-ready)

**Who it's for.** People who love live music but end up going alone or not at all — because their close friends don't share the taste, and the wider network of people who do is invisible. Also the crews who already go together but lose an hour of every group chat to logistics.

**How it strengthens connection.** Encore surfaces second-degree connections with demonstrable taste compatibility — not "you both like this artist" but "you both ranked the same three shows highly and cared about the same things." It gives them a shared, low-stakes reason to talk (a specific show they both saw) and a concrete plan to meet in person. Every match ends at a real venue on a real night.

**Why AI is essential.** The structured data can tell you *that* two people match. Only a language model can turn fourteen preference numbers and a chat thread into a reason to text someone, and into a plan that names who's compromising and why it's still worth it. We ground every generation in the structured record so the AI explains rather than invents.

**Trust.** Bringing people closer means putting them in the same room, so safety is part of the product, not a footer. Encore gates every stranger-facing feature — matching, open crews, joining a crew with non-friends — behind ID verification, and photo-evidenced attendance means the person you're matched with demonstrably goes to shows. AI writes the introduction; verification makes it safe to send.

## 16. Submission checklist (M4 owns)

- [ ] Public GitHub repo: README with setup, architecture diagram, team, and a clear note that verification is mocked (names Stripe Identity/Persona for production)
- [ ] 2–3 min demo video (YouTube unlisted) following Sam's story: import → rank → locked matches → verify → unlocked → crew → plan
- [ ] Devpost: track = **Oracle of the Deep**; challenges = **Meta, SpaceXAI, Notability**; "Built with" includes **Notability**
- [ ] Notability note on how we used it + 2 screenshots
- [ ] Create-X interest box checked
- [ ] Devpost link submitted to **expo.hexlabs.org before 7:00 AM**
- [ ] Demo photo set on laptop A *and* laptop B; video on laptop B as backup
- [ ] Sam reset to unverified with 6 shows unimported before each run-through
