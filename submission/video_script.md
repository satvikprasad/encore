# Demo video script (2–3 min)

Record on Laptop B at 1920×1080 after `make demo-reset`. Follows the run-through in `AGENTS.md` §10. Timings are targets.

| # | Time | On screen | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:15 | Home as Sam | "This is Sam. Sam goes to a lot of shows, but concert apps only know what you bought, not what you thought of it. And the friends who'd love the same shows are strangers in the same room." |
| 2 | 0:15–0:40 | Import → drop 14 photos → 6 shows found, 2 decoys ignored → Confirm all | "Encore reads the time and location from Sam's camera roll, on the device. The photos never leave the phone. Six shows found from a year of photos, and the park picnic and the afternoon at the Masquerade are correctly ignored." |
| 3 | 0:40–1:15 | Review Aurora Fields at State Farm Arena (taps below) → 3 compares (answers below) → ranked list, preference bars | "Sam rates one show across seven dimensions, then answers three quick 'better or worse' questions. Each question is picked to be the most informative, and Encore learns what Sam actually cares about: production, not the crowd." |
| 4 | 1:15–1:45 | Event page for Lumen Drift → locked matches → Verify → unlocked, Maya 92%, Jordan 80% | "For the next show, Encore can find fans with the same taste who are going. But meeting strangers needs trust, so matches are only visible to verified fans. One quick check, and Sam sees Maya and Jordan, with why they match and something to say first." |
| 5 | 1:45–2:30 | Start a crew with both → send the 3 messages below → Make a plan → Adopt | "They start a crew. Everyone says what matters to them, and Encore turns the chat into a plan that works for everyone: within Jordan's budget, at a venue with a quiet room for Maya." |
| 6 | 2:30–2:45 | Plan card pinned | "Encore: your concert memory, and your next crew." |

## Scripted review (Aurora Fields, State Farm Arena)

| Music | Crowd | Venue | Accessibility | Production | Value | Again? | Tags | Paid |
|---|---|---|---|---|---|---|---|---|
| 4 | 3 | 3 | 4 | 4 | 3 | Yes | LED wall | $95 |

## Scripted comparisons

The questions are deterministic after `make demo-reset`; answer exactly like this so the preference bars end with **Production** on top and the matches read Maya 92%, Jordan 80% (checked by `api/tests/test_demo_flow.py`):

1. Aurora Fields vs **Paper Satellites** → pick **Paper Satellites**
2. **Night Harbor** vs Aurora Fields → pick **Night Harbor**
3. Paper Satellites vs **Night Harbor** → pick **Night Harbor**

## Scripted crew messages

Type these exactly (they match `fixtures/crew_plan.json`):

1. **Sam:** Lumen Drift at The Eastern on the 24th? I want seats where we can actually see the lights.
2. **Jordan:** I'm in but I can't do more than $75 all in.
3. **Maya:** Down if we can be somewhere less loud — I need a quiet spot to step out to.

> If Ticketmaster data is seeded later, `t01` becomes the real show; replace "Lumen Drift" and the date to match.

## Checklist before recording

- [ ] `make demo-reset` run; Sam shows unverified
- [ ] API and web running on the real API (the default; `NEXT_PUBLIC_USE_FIXTURES` unset or false)
- [ ] `GROK_API_KEY` set in `.env` (fallback templates still work if it isn't)
- [ ] Browser at 1920×1080, notifications off, 14 demo photos in one folder
- [ ] Full run-through timed at ≤ 4 minutes
