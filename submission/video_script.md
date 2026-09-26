# Demo video script (2–3 min)

Record on Laptop B at 1920×1080 after `make demo-reset`. Follows the run-through in `AGENTS.md` §10. Timings are targets.

| # | Time | On screen | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:15 | Home as Sam | "This is Sam. Sam goes to a lot of shows, but concert apps only know what you bought, not what you thought of it. And the friends who'd love the same shows are strangers in the same room." |
| 2 | 0:15–0:40 | Import → drop 14 photos → 6 shows found, 2 decoys ignored → Confirm all | "Encore reads the time and location from Sam's camera roll, on the device. The photos never leave the phone. Six shows found from a year of photos, and the park picnic and the afternoon at the Masquerade are correctly ignored." |
| 3 | 0:40–1:15 | Review Aurora Fields at State Farm Arena → 3 compares → ranked list, preference bars | "Sam rates one show across seven dimensions, then answers three quick 'better or worse' questions. Each answer is picked to be the most informative, and Encore learns what Sam actually cares about: production, not the crowd." |
| 4 | 1:15–1:45 | Event page for the target show → locked matches → Verify → unlocked, Maya 84%, Jordan 71% | "For the next show, Encore can find fans with the same taste who are going. But meeting strangers needs trust, so matches are only visible to verified fans. One quick check, and Sam sees Maya and Jordan, with why they match and something to say first." |
| 5 | 1:45–2:30 | Start a crew with both → send the 3 messages below → Make a plan → Adopt | "They start a crew. Everyone says what matters to them, and Encore turns the chat into a plan that works for everyone: within Jordan's budget, at a venue with a quiet room for Maya." |
| 6 | 2:30–2:45 | Plan card pinned | "Encore: your concert memory, and your next crew." |

## Scripted crew messages

Type these exactly (they match `fixtures/crew_plan.json`):

1. **Sam:** Lumen Drift at The Eastern on the 24th? I want seats where we can actually see the lights.
2. **Jordan:** I'm in but I can't do more than $75 all in.
3. **Maya:** Down if we can be somewhere less loud — I need a quiet spot to step out to.

> Replace "Lumen Drift" and the date with the real `t01` artist/date once M1 pins it.

## Checklist before recording

- [ ] `make demo-reset` run; Sam shows unverified
- [ ] API and web running; `NEXT_PUBLIC_USE_FIXTURES=false`
- [ ] `GROK_API_KEY` set (fallbacks still work if it isn't)
- [ ] Browser at 1920×1080, notifications off, 14 demo photos in one folder
- [ ] Full run-through timed at ≤ 4 minutes
