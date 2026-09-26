# Encore — Meta challenge write-up

<!-- Draft. Align with the Meta challenge prompt and DESIGN.md §15 (not in repo at time of drafting); adjust to what shipped. -->

## Summary

Encore helps people turn the concerts they've already been to into a shared, social taste profile, then safely meet fans with the same taste who are going to the next show, and plan the night together as a group.

## Connection, with safety built in

- **Taste-based, not proximity-based.** Matches come from how two people rated the same shows, restricted to people within two hops of your friends.
- **Verification gate.** Seeing matches, or starting or messaging a crew that includes someone you don't follow, requires identity verification. Friend-only crews stay open.
- **Grounded AI.** Match explanations and icebreakers may cite only shows both people actually attended; outputs that don't are discarded in favour of a template.

## Privacy

Photos never leave the device. The browser extracts only coordinates and a timestamp from each photo's metadata and sends those to the server; the image itself is never uploaded.

## Accessibility

Accessibility is a first-class rating dimension, and venues carry an access profile (step-free entry, ADA seating, quiet room, strobe policy, interpreter). Crew plans treat members' needs as hard constraints and explain the trade-off in plain language.

## What's mocked

Identity verification is a mock provider with the same interface a production provider would use (Stripe Identity or Persona).
