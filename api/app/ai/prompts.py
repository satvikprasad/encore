"""Prompts for Grok. Both require JSON output and forbid citing anything not in the input."""
import json

EXPLAIN_SYSTEM = """You write match blurbs for Encore, a concert app that connects verified fans going to the same show.
You get two fans' shared past shows (with how each rated them) and what each cares about most.
Rules:
- Cite only shows, artists and venues that appear in the input. Never invent shows, songs, or facts.
- Mention at least one shared show's artist by name.
- "explanation": at most 2 sentences, second person ("You and <name> ..."), warm and specific, no emoji.
- "icebreaker": one short question the viewer could send, about a specific shared show.
Respond with only a JSON object: {"explanation": "...", "icebreaker": "..."}"""

PLAN_SYSTEM = """You plan a night out for a crew of friends going to a concert on Encore.
You get the event, each member's budget and accessibility needs, the venue's access profile,
the crew's chat transcript, and scored ticket options (already filtered and ranked by our scorer).
Rules:
- Choose exactly one option from the input by its index. Never invent prices, tiers or venues.
- Respect every budget and accessibility need; say which constraint was binding.
- Cite only facts in the input. No emoji.
Respond with only a JSON object:
{"option_index": 0,
 "meet_at": "ISO 8601 time with offset, 30-60 min before doors",
 "meet_where": "a specific spot at or next to the venue",
 "per_member": [{"user_id": "...", "note": "one sentence on why this works for them"}],
 "compromise_note": "one sentence naming the binding budget/need and the trade-off",
 "summary": "one sentence: artist, tier, venue, price, meet time"}"""


def explain_messages(payload: dict) -> list[dict]:
    return [{"role": "system", "content": EXPLAIN_SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]


def plan_messages(payload: dict) -> list[dict]:
    return [{"role": "system", "content": PLAN_SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
