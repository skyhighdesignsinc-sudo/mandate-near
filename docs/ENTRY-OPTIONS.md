# Entry options, grounded in other products' complaints

Written 2026-11-13 for the sponsor to choose from. Two submission slots exist and both are
taken, so every option here either replaces `mandate` or is a change to an existing entry.
Field counts come from `UNIQUENESS-AUDIT.md` §4.7 (all 1,098 entries); complaint evidence is
cited with its source.

## What the complaints actually say

| Source | The number | The mechanism |
|---|---|---|
| Zapier Community, Feb 2024 | **26,000 tasks** in one week against a normal 1,400 | a loop errored, went to "Waiting", restarted, and re-ran the loop each time |
| Zapier review analysis, Oct 2026 | **$400–$1,200** surprise invoices | usage alerts fire at 80%/100% but "don't arrive fast enough to stop a rapidly looping Zap" |
| OpenAI forum, via alan.is, Nov 2026 | **$9,152** bill on $5 of prepaid credit, auto-reload off | "requests kept landing long after the credits ran out" |
| Google AI forum, Apr 2026 | **~$4,368** from a key leaked in 2022 | credential captured by a scanner years earlier |
| r/LLMDevs, 2026 | **$260** in credits overnight | a session marked failed kept calling for 20+ hours; refund was "a courtesy" |
| subscope.work, Jun 2026 | **$4,200** over one weekend | a retry decorator with no backoff, in a loop that failed instantly |

Three sentences repeat across sources: *"We found out from the invoice."* — *"the limit was
bypassed"* — *"a refund is a courtesy, not something you can count on."*

## Why this is a NEAR-shaped problem

In every case the authoritative meter belonged to the party being paid. The agent could ask
for a thousand calls because nothing between the agent and the vendor's ledger could say no.
A payment rail where the *payer's* contract is the last step before money moves inverts that:
the ceiling is enforced by code the payer chose, the refusal has a reason code, and the
evidence is a public transaction rather than a support ticket.

That is the mechanism `mandate` already implements. Which produces an uncomfortable but
useful conclusion: **the market evidence argues for the app we have, not for a new one.**

## The options

### A — Reposition `mandate` as the hard stop for AI spend (recommended)

No contract change. Rewrite the README opening, the demo script and the SCREENER around the
complaint pattern: a loop that keeps calling, a bill discovered weeks later, a ceiling the
vendor's dashboard could not enforce. Use our own measured rows as the proof that the ceiling
binds *before* the money moves.

- **Cost:** about two hours of copy, demo script and one new screener step.
- **Novelty:** unchanged from §4.7 — the vault mechanic is common; what is rare is showing
  the refusal with a typed code and a transaction hash.
- **Risk:** none technical. It admits Mandate is one of 299 `security`∧`agents` entries and
  competes on execution rather than on category.

### B — A contestable payment rail (the one unclaimed mechanism)

Settlement is not final when the agent pays: funds sit in a challenge window, the payer can
contest with a reason code and evidence hash, and the funds return without the vendor's
consent. It answers "a refund is a courtesy" with a contract call.

- **Novelty:** `dispute`/`arbitration` appears in **0 of 1,098** names (§4.7). The nearest
  neighbours are three escrow entries, none of which let the payer reverse a settled payment.
- **Cost:** 8–12 hours — new state, a window that must be enforced by block height, tests,
  console surface, a demo that shows money leaving and coming back, and a video.
- **Risk:** high. `AGENTS.md` §6 forbids NEAR Business, specifically "escrowed invoicing".
  This is payment contestability for agent spend, not invoicing, but a judge may not see the
  difference and the boundary is ours to defend in writing.
- **Verdict:** only with an explicit sponsor override and acceptance that Baseline gets no
  further work tonight.

### C — Spend forensics ("which loop caused this bill?")

Rejected. It needs provider-side telemetry we do not have, and an off-chain tool doing exactly
this was published on 2026-11-10 (`dev.to/getbrello`). It would be a clone of a two-day-old
product with no chain component.

## Recommendation

Do **A** now, keep `baseline` as the thesis entry, and leave **B** for after the deadline. The
complaint evidence is the strongest argument either submission has, and it costs two hours
instead of twelve — which is the difference between a filmed demo and an unfinished contract.
