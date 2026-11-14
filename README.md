# Mandate — authority that is enforced, recorded, and reversible

An agent gets a budget and an allowlist that the key itself cannot exceed, a reason for every
spend that the caller supplies as hashes and the contract checks against the intent (a hash
comparison, not a signature check — C24), and a one-call kill switch that also deletes the
agent's key. Since D-024 the
contract also has a challenge window on recorded settlements; it was withdrawn on 2026-11-13
after its own demo failed, fixed and redeployed on 2026-11-14, and restored only once the
end-to-end run passed (C26).

Tracks: `security`, `agents`, `business`. Testnet only. Submission #1 of two; the sibling
submission is [`baseline`](https://github.com/skyhighdesignsinc-sudo/baseline-near#readme), which measures whether policies like this one
actually refuse what they claim.

## Why this exists

The failure is well documented, and it is never "the model decided to spend". It is a loop, a
leaked key, or a limit that existed only in the vendor's billing system:

| Where | What was reported |
|---|---|
| Zapier Community, Feb 2024 | a looping automation consumed **26,000 tasks** in a week against a normal 1,400 |
| Zapier review analysis, Oct 2026 | runaway Zaps produced **$400–$1,200** invoices; alerts fire at 80%/100% but arrive too late to stop the loop |
| OpenAI forum, reported Nov 2026 | **$9,152** bill on $5 of prepaid credit with auto-reload off — "requests kept landing long after the credits ran out" |
| Google AI forum, Apr 2026 | **~$4,368** from a key that had leaked in 2022 |
| r/LLMDevs, 2026 | a session marked failed kept calling for 20+ hours; the refund was "a courtesy" |

The common sentence is *"we found out from the invoice"*. In every case the authoritative meter
belonged to the party being paid. Mandate puts the ceiling in a contract the payer owns, so the
refusal happens before the money moves and leaves a reason code behind.

## What it does

- **The key cannot overspend.** The agent holds a NEAR FunctionCall access key scoped to
  `spend` on this contract. It cannot transfer, deploy, add keys or delete the account.
- **The policy is enforced by the contract**, in a fixed check order, with a typed code for
  every refusal (`per_tx_exceeded`, `per_day_exceeded`, `per_counterparty_day_exceeded`,
  `counterparty_not_allowed`, `budget_exhausted`, `attestation_mismatch`, `policy_changed`,
  `decision_replayed`, `mandate_suspended`, `mandate_expired`, …). The code survives in the
  failed receipt, so a refusal is auditable without trusting this repository.
- **Above a threshold the spend becomes a request**, answered later by the owner — approval is
  a separate on-chain call, never a paused transaction.
- **`revoke_key` suspends the mandate and deletes the agent's key in the same receipt**, so the
  protocol stops accepting that signature rather than the contract merely refusing to pay.
- **`contest`, the challenge window (D-024).** A settlement records its amount and block; the
  owner can call `contest` with one of four reason codes and an evidence hash inside a
  100-block window, the amount returns to the balance, and the logged entry stays readable via
  `list_contests`. Live on 2026-11-14 on `m107`, including the assertion that the day's
  allowance does **not** come back with the money.

## The challenge window, precisely

`settle` records a foreign tx reference; it does not move value. A contest therefore reverses
**our own ledger entry**:

- window: 100 blocks from the settling block, inclusive at both ends (a settlement at block 100
  can be contested at 200, not at 201);
- reasons, frozen: `not_delivered`, `wrong_amount`, `duplicate`, `key_compromised`;
- one contest per settlement; a second is refused with `already_contested`;
- migrated settlements cannot be contested, because their amount was never stored.

**The defect this shipped with, and how it was closed.** The first build subtracted the
refunded amount from `spent_day`, so within one day `spend → contest → spend → contest`
handed the daily allowance back — the loop the sentence above was written to exclude
(`docs/AUDIT-2026-11-14.md` F-5). Fixed on 2026-11-14: the subtraction is gone, the wasm was
rebuilt and deployed code-only (`7C2sALjW…`), and `make contest-demo` now prints
`balance 1e18, spent_total 0, spent_day 5` — the money returns, the allowance does not.

What it is not: a chargeback. No value leaves the contract at settlement and nothing is
recovered from a vendor.

## Run it

```bash
make dev            # console + seeded replay, no secrets
make test           # 36 contract tests + worker tests
make demo           # deterministic replay, expected output first
make verify         # hash self-test; prints inputsHash
make doctor         # which features are ACTIVE vs FALLBACK
make chain-demo     # real testnet spends, written to console/data/chain.json
make key-demo       # add a key, revoke it, resume: C25
make contest-demo   # spend, settle, contest, second contest refused: C26
make probe-revoke   # a stranger tries to delete the account's key: refused, M-01
make uat            # Playwright: 19 behavioural + 5 UAT journeys
```

Every command above is documented in [`mandate/docs/SCREENER.md`](mandate/docs/SCREENER.md) with the output it
should produce. The console is static and holds no key; it renders contract views and the
committed replay.

## What this does not claim

- **No mainnet, no audit, no custody.** Testnet prototype for a hackathon.
- **The unit on screen is a ledger unit, not a token.** `balance` and the policy ceilings
  are integers the contract keeps; `create_mandate` credits the attached deposit to that
  integer. There is no NEP-141 integration and no transfer to a vendor. Getting funds out is
  a two-step owner action: `close_mandate` releases a balance and `withdraw` pays the owner
  everything above storage and the sum of open balances (C30, live `X128ZuNo…` and
  `FNT9vHo8…`). That path moves the account's NEAR, not an asset the label names: the 88.00
  USDC on the desk is a six-decimal label, not a balance an exchange would honour, so **do
  not deposit funds you expect to recover at a market price**.
- **The attestor is a trusted component in this build.** The contract compares a hash; it does
  not verify Intel's signature. C24 says so.
- **The dispute log has no console surface yet.** `list_contests` is a contract view and the
  demo prints it; the UI does not render it. Saying this is cheaper than showing a screenshot
  of something that does not exist.
- **Settlements migrated from before D-024 are not contestable**: their amount was never
  stored, so a refund amount cannot be invented. The migration marks them `contestable: false`.
- **One repair path is live-tested, not modelled.** The migration moved 56 mandates and every
  unit intact — deploy `DYBS6jnX…`, migrate `7XDEy6q1…`, 608,530-byte wasm.

## Where the evidence lives

- `docs/CLAIMS.md` — the only sentences this project is allowed to say, each with its artefact.
- `mandate/docs/SCREENER.md` — a hostile reviewer's path, step by step, with expected output.
- `mandate/docs/ARCHITECTURE.md`, `docs/UML.md` — shape, check order, trust model.
- `docs/DECISIONS.md` — D-020 (the day that was 86.4 ms), D-022 (key deletion), D-024 (this
  window and its boundary against building an invoicing product).

MIT licensed. No secrets in the repository; `.env.example` only.

## Only the agent may ask

`spend` checks that the caller is the account named as the agent (C27). Without that check the
key scoping would protect the agent's own key but not the contract: any account could call
`spend` and burn the day's allowance up to the caps. Live proof: mandate `m58` names
`someone-else-agent.testnet` as its agent, the owner calls `spend` (`3aqb32W9…`), the contract
answers `unauthorized` and the balance is unchanged.

Contract tests: **37**.

## Media

- `media/mandate-demo.mp4` — 71-second narrated walkthrough of the replay, the refusal list, the mandate record and the verify route.
- `media/01-desk.png` — the recorded run, event by event, with the proof rail.
- `media/02-mandate.png` — policy revisions and the limits in force at each block.
- `media/03-refusals.png` — the refusal vocabulary, one code per line.
- `media/04-verify.png` — the hashes a reader can recompute in the browser.

Every frame is a replay of a contract run or a contract view; none of them is a mock.

## Judge view

The console is served statically, with no server and no key:

- **https://skyhighdesignsinc-sudo.github.io/mandate-near/** — the same page the video records.
- `media/mandate-journey.mp4` — 61 seconds, one journey: a 12.00 spend authorised, a 45.00 spend refused with `per_counterparty_day_exceeded`, balance unchanged at 88.00.

The page reads three JSON files produced by the contract (`snapshot.json`, `docs.json`,
`chain.json`). `chain.json` holds the hashes of real testnet transactions; every one of them
opens on `testnet.nearblocks.io`.
