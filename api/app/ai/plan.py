"""Crew plan: M2's group scorer picks and scores options, Grok writes the prose.
Fallback: top option, per-member notes from scores and constraints."""
import json
import re
from datetime import datetime, timedelta

from . import grok, prompts

try:
    from ..ml.group import score_options as _score_options
except ImportError:  # M2 hasn't shipped group.py yet
    _score_options = None

NEED_FEATURES = {
    "mobility": "step-free entry and ADA seating",
    "sensory": "a quiet room",
    "neurodivergent": "a quiet room",
    "hearing": "an interpreter on request",
    "vision": "ADA seating",
    "chronic": "ADA seating",
}


def need_met(need: str, access: dict) -> bool:
    """Constraint satisfaction rules from AGENTS.md §3 (same as ml/group.py)."""
    if need == "mobility":
        return access["step_free"] and access["ada_seating"]
    if need in ("sensory", "neurodivergent"):
        return access["quiet_room"] and access["strobe_policy"] != "unrestricted"
    if need == "hearing":
        return access["interpreter"] == "on_request"
    return access["ada_seating"]  # vision, chronic


# ---- options ---------------------------------------------------------------

def _normalize(option: dict) -> dict:
    """Accept M2's option dicts; we rely on event_id, tier_label, price and per-member scores."""
    per_member = option.get("per_member") or [
        {"user_id": uid, "score": s} for uid, s in option.get("member_scores", {}).items()]
    return {
        "event_id": option["event_id"],
        "tier_label": option["tier_label"],
        "price": float(option["price"]),
        "per_member": [{"user_id": m["user_id"], "score": float(m["score"])} for m in per_member],
    }


def _stub_options(event: dict, members: list[dict]) -> list[dict]:
    """Stand-in until ml/group.py lands: three price tiers, scored on budget only."""
    lo, hi = event["price_min"], event["price_max"]
    if lo is None or hi is None:
        tiers = [("General admission", lo or hi or 0.0)]
    else:
        tiers = [("Cheapest", lo), ("Mid-price", round((lo + hi) / 2, 2)), ("Best seats", hi)]
    options = []
    for label, price in tiers:
        scores = [{"user_id": m["id"],
                   "score": 1.0 if m["budget_max"] is None or price <= m["budget_max"] else 0.0}
                  for m in members]
        options.append({"event_id": event["id"], "tier_label": label, "price": price, "per_member": scores})
    options.sort(key=lambda o: (-min(s["score"] for s in o["per_member"]), o["price"]))
    return options


def score_options(event: dict, members: list[dict]) -> list[dict]:
    if _score_options is None:
        return _stub_options(event, members)
    return [_normalize(o) for o in _score_options([m["id"] for m in members], event["id"])]


# ---- fallback prose ----------------------------------------------------------

def _first(name: str) -> str:
    return name.split()[0]


def binding_budget(members: list[dict]):
    budgets = [m for m in members if m["budget_max"] is not None]
    return min(budgets, key=lambda m: m["budget_max"]) if budgets else None


def _meet(event: dict) -> tuple[str, str]:
    anchor = datetime.fromisoformat(event["doors_at"] or event["start_at"])
    meet_at = (anchor - timedelta(minutes=30 if event["doors_at"] else 60)).isoformat(timespec="minutes")
    return meet_at, f"{event['venue']['name']} box office"


def _money(x: float) -> str:
    return f"${x:,.0f}" if float(x).is_integer() else f"${x:,.2f}"


def fallback_plan(event: dict, members: list[dict], option: dict) -> dict:
    venue, access = event["venue"]["name"], event["venue"]["access_profile"]
    scores = {s["user_id"]: s["score"] for s in option["per_member"]}
    per_member = []
    for m in members:
        if m["accessibility_needs"]:
            need = m["accessibility_needs"][0]
            note = (f"{venue} has {NEED_FEATURES[need]} for your {need} needs."
                    if need_met(need, access) else
                    f"Heads up: {venue} doesn't have {NEED_FEATURES[need]} for your {need} needs.")
        elif m["budget_max"] is not None:
            note = f"{_money(option['price'])} fits your {_money(m['budget_max'])} budget."
        else:
            note = "Top-scored option for what you care about."
        per_member.append({"user_id": m["id"], "score": round(scores.get(m["id"], 0.0), 2), "note": note})

    parts = []
    tightest = binding_budget(members)
    if tightest:
        parts.append(f"{_first(tightest['name'])}'s {_money(tightest['budget_max'])} budget is the tightest, "
                     f"so we went with {option['tier_label']} at {_money(option['price'])}")
    for m in members:
        for need in m["accessibility_needs"]:
            parts.append(f"{_first(m['name'])}'s {need} need is covered by {NEED_FEATURES[need]} at {venue}"
                         if need_met(need, access) else
                         f"{venue} lacks {NEED_FEATURES[need]} for {_first(m['name'])}'s {need} need")
    compromise = ("; ".join(parts) + ".") if parts else "Everyone's top-scored option, no trade-offs needed."

    meet_at, meet_where = _meet(event)
    meet_time = datetime.fromisoformat(meet_at).strftime("%-I:%M %p")
    return {
        "option": {"event_id": option["event_id"], "tier_label": option["tier_label"], "price": option["price"]},
        "meet_at": meet_at,
        "meet_where": meet_where,
        "per_member": per_member,
        "compromise_note": compromise[0].upper() + compromise[1:],
        "summary": (f"{event['artist']['name']}, {option['tier_label']} at {venue}, "
                    f"{_money(option['price'])} each. Meet at the box office at {meet_time}."),
    }


# ---- Grok --------------------------------------------------------------------

def _validator(event: dict, members: list[dict], options: list[dict]):
    tightest = binding_budget(members)
    needs = {n for m in members for n in m["accessibility_needs"]}

    def parse(content: str) -> dict:
        obj = grok.parse_json_object(content)
        option = options[int(obj["option_index"])]
        if tightest and option["price"] > tightest["budget_max"]:
            raise ValueError("option over budget")
        notes = {n["user_id"]: str(n["note"]).strip() for n in obj["per_member"]}
        scores = {s["user_id"]: s["score"] for s in option["per_member"]}
        per_member = [{"user_id": m["id"], "score": round(scores.get(m["id"], 0.0), 2), "note": notes[m["id"]]}
                      for m in members]
        prose = " ".join([obj["compromise_note"], *notes.values()])
        # The plan must name the binding budget and every need (AGENTS.md §9 M4 AI plan).
        if tightest and not re.search(rf"\$?{tightest['budget_max']:g}\b", prose):
            raise ValueError("binding budget not named")
        if any(n not in prose.lower() for n in needs):
            raise ValueError("accessibility need not named")
        datetime.fromisoformat(obj["meet_at"])
        return {
            "option": {"event_id": option["event_id"], "tier_label": option["tier_label"], "price": option["price"]},
            "meet_at": obj["meet_at"],
            "meet_where": str(obj["meet_where"]),
            "per_member": per_member,
            "compromise_note": str(obj["compromise_note"]),
            "summary": str(obj["summary"]),
        }

    return parse


def make_plan(event: dict, members: list[dict], messages: list[dict]) -> dict:
    options = score_options(event, members)
    names = {m["id"]: _first(m["name"]) for m in members}
    payload = {
        "event": {"artist": event["artist"]["name"], "venue": event["venue"]["name"],
                  "start_at": event["start_at"], "doors_at": event["doors_at"]},
        "venue_access": event["venue"]["access_profile"],
        "members": [{"user_id": m["id"], "name": names[m["id"]], "budget_max": m["budget_max"],
                     "accessibility_needs": m["accessibility_needs"]} for m in members],
        "transcript": [f"{names.get(msg['user_id'], msg['user_id'])}: {msg['text']}" for msg in messages],
        "options": [{"index": i, "tier_label": o["tier_label"], "price": o["price"],
                     "member_scores": {names[s["user_id"]]: round(s["score"], 2) for s in o["per_member"]
                                       if s["user_id"] in names}}
                    for i, o in enumerate(options)],
    }
    fb = fallback_plan(event, members, options[0])
    return grok.chat(prompts.plan_messages(payload), fallback=fb,
                     parse=_validator(event, members, options), json_mode=True)
