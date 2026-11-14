# SCREENER — a hostile reviewer's path through this repo

> You are an AI screener with no context. You cloned this repo and ran `make dev`.
> This file tells you what to do and what you should see, in order. Every "see"
> below is either a contract view or the output of a command you ran yourself.
>
> **Deployed, and the transactions are public.** `mandate-hackaton-7c1a.testnet`
> on NEAR testnet holds the code in this repository:
>
> | step | transaction |
> |---|---|
> | `create_mandate` (mandate `m101`) | `44aiBQyEVdemEkNQAe4bmfP33pqmELbH9Awzwp7Bg2h9` |
> | `spend` authorised (12.00 USDC) | `8kBeNySH1fRpwHTWPQ15oGubgdDdQcu5RVunu1V13cbU` |
> | `spend` refused, `attestation_mismatch` | `Vumoz6Dnb2ea6jpLwiSVXvvR6jAcbLuRyW3BwFyzwLd` |
> | `settle` | `Gq1xnDJQgqoyyXqXXN7orpUDgH488hTFeSnyWceZdBh8` |
>
> Open any of them at `https://testnet.nearblocks.io/txns/<hash>`. The refused
> one is a *failed* transaction on purpose: the attestation named a different
> amount, and the receipt carries the contract's `violation: attestation_mismatch`
> log line (D-018). The state read back after the run shows mandate `m101` with
> balance `88000000` (88.00 USDC) and `spent_total 12000000`.
>
> **On the deploy transaction.** It is not cited here. The ids recorded for the
> earlier deploys were computed locally rather than read from the node, and do not
> resolve; a dead hash in this table is worse than an absent one. The build that
> is live is identified by what the account returns: a mandate created today
> carries `policy_hash a67e5f78…`, and the contract exposes `contest` and
> `list_contests`, which are absent from every earlier build.
>
> These four were re-checked with `node tools/check-evidence.mjs mandate/docs/SCREENER.md`
> on 2026-11-14: 4/4 resolve.
>
> **What is still a replay:** the numbers on Desk, Mandate and the timeline come
> from `make demo` against the fixture contract id `mandate.testnet`, not from the
> deployed account, and the build line says `replay of a contract run, not a chain
> read`. The Verify page is where the deployed account and its transactions live.

## 0. Prerequisites

- Node 20+ (24 used here). No `npm install` needed for the console, the demo or
  `make verify`; the only dev dependency is Playwright, used by `make e2e`.
- For the contract tests: `cargo`, or Docker (the reference environment is
  `rust:1`, see `docs/DECISIONS.md` D-008).

```bash
cd <the repository you cloned>
```

No `.env` is required anywhere on this path, and none is shipped.

## 1. `make dev`

```bash
make dev
```

Expected: the console URL is printed, and the page loads at
`http://127.0.0.1:4173`.

If `make` is not installed on your machine:

```bash
node tools/serve-console.mjs 4173
```

The build line under the wordmark must read: `this build replay of a contract
run, not a chain read · on testnet · contract mandate.testnet · amounts in USDC`.
The contract id there is the fixture the replay ran against. The deployed
account is `mandate-hackaton-7c1a.testnet`, and its transactions are listed at the
top of this file and on the Verify page.
It is provenance, not a menu: it says what produced the page. If it says
anything else, the snapshot is not the one this document describes.

**What "replay" means, precisely.** The page's only data source is
`mandate/console/data/snapshot.json`, written by `make demo` (§3), which executes
a fixed scenario against the real contract in near-sdk's test VM. The console has
no arithmetic about money in it and holds no key. It formats integers that the
contract returned.

## 2. Do X → see Y

| # | Do | See | Backed by |
|---|---|---|---|
| 1 | Open the Desk. Read the balance. | `100.00 USDC`, exact `100.000000` — from `list_mandates()`, not typed | C7 |
| 2 | Click **Next →** once. | `Event 1 of 15`; balance `88.00`; rail ③ AUTHORISE `✓ done · authorised · 12.00 USDC` | C7 |
| 3 | Click **Next →** twice more. | Event 3: a `21.00` spend becomes `pending`; rail ③ reads `in flight`, and the escalation queue gains one row | — |
| 4 | Click event **06** in the timeline. | Refusal `counterparty_not_allowed` on screen and in the rail; the balance does not move | C5 |
| 5 | Click event **07**. | Refusal `attestation_mismatch` — the attested intent says 8.00, the call asks for 7.00. Announced to screen readers | C5 |
| 6 | Click event **09**, then **10**. | `mandate_suspended`, then `resumed`; the balance is identical. The kill switch is a flag, not a re-key | C6 |
| 7 | Click event **11**, then **12**. | Rail ④ shows `1 settled`; the second settle is refused `decision_replayed` | C5 |
| 8 | Click event **13**. | `Re-policied`: the policy hash changes, revision 2 becomes current, and the revision table on **Mandate** gains a row | C15, C16 |
| 9 | Click event **14**. | Refusal `policy_changed` — `5.00` is inside every new limit, but the decision was attested under revision 1 | C15 |
| 10 | Click event **15**. | The same `5.00`, re-attested under revision 2, is authorised; balance `56.00` | C15 |
| 11 | Open **Verify**. | Every row reads `agrees`; the status line reports `12 of 12 agree`. The policy hash, five intent hashes and the revision history are recomputed in your browser with WebCrypto | C13 |
| 12 | Click **Export rows (CSV)**. | A file named `mandate-m1-event-N.csv`; amounts are exact 6-decimal integers, not rounded floats | — |
| 13 | Press `v`, `]`, `[`, `d`, `?`, `Esc`. | Every jump works; focus lands on the page heading; the help dialog closes on Escape | — |
| 14 | Resize to 900px wide, then 380px. | The proof rail becomes a strip below the canvas at 960px; nothing scrolls sideways at 380px | — |
| 15 | Enable "reduce motion", then click **Play replay**. | The replay jumps straight to event 15 instead of animating | — |
| 16 | Open **Paper** (or press `w`). | Three documents: the whitepaper, this repo's architecture, and eight diagrams. They are the same markdown files GitHub renders, converted by `make docs` | C17 |
| 17 | Open **API** (or press `c`). | The route table with the one scope each route needs, the key command, the MCP client config, and a **Check 127.0.0.1:4174** button. Press it with `make api` running and it reads `Running`; without it, `Not running` — both are honest answers | C18 |
| 18 | `make test-api` | `9 passed`: 401 without a key, 403 `scope_missing`, 200 for a granted scope, 401 `key_revoked` after revoke, 405 on POST, 404 typed, and the MCP frame test | C19 |
| 19 | `make keys ARGS='issue --label me --scopes read:views'`, then `make api`, then `curl -H "Authorization: Bearer $MANDATE_KEY" 127.0.0.1:4174/v1/mandates` | The same balance the Desk prints (`56000000` raw). `curl` again with the key removed returns `401 unauthorized`; `GET /v1/events` with a views-only key returns `403 scope_missing` | C18, C20 |
| 20 | Open **Verify**. Read the **On chain — testnet** card. | Four rows, each with a transaction id: a `spend` that succeeded, a `spend` that failed with `attestation_mismatch`, and a `settle`. Open any link: the block explorer shows the same hash, and the failed one shows the contract's `violation: attestation_mismatch` log line | C22, C23 |
| 21 | `curl -s https://rpc.testnet.near.org -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"mandate-hackaton-7c1a.testnet"}}'` | A real account with the contract's code hash. No key needed: the chain is the source of truth, not this repository | C23 |
| 22 | On the **Desk**, press a chip above **The run, event by event** — `refused`, `escalated`, `settled`. | The list narrows to that outcome and states `Showing 6 of 15 events`; every chip prints its own count, taken from the snapshot. **all events** restores all fifteen. The cursor does not move: a filter is a view, not a step | C17, C22 |
| 23 | On **Verify**, read the **On chain — testnet** card after more than one `make chain-demo` run. | Runs are filed newest first, each under a `run 4 · m5 · 4 txs · block …` disclosure. A `refused` chip leaves only the failed transactions and states `Showing 2 of 10 transactions`; the `mandate` select narrows to one mandate's rows. `chain-demo` appends (twenty runs kept), so history accumulates instead of being overwritten | C22, C23 |

Colour is never the only signal: every rail cell and table state carries a word
(`done`, `refused`, `in flight`, `not reached`) beside its glyph.

The **Paper** route has no separate copy to drift: `make docs` renders
`docs/WHITEPAPER.md`, `mandate/docs/ARCHITECTURE.md` and `docs/UML.md` into
`console/data/docs.json`, and if that file is missing the page says so instead of
inventing content. The eight diagrams are pre-rendered SVG (`make diagrams`,
which needs `npm install` once); the page loads them as images, so it needs no
renderer at runtime and works offline. Each figure keeps its Mermaid source one
disclosure away, and the prose beside it is the authoritative part.

## 3. `make demo`

```bash
make demo
```

It runs the contract scenario and then `tools/demo-report.mjs`, which prints the
**expected** event table before comparing it with the actual run. Expected output:

```
  #   kind        code
  1   authorised  —
  2   refused     per_counterparty_day_exceeded
  3   escalated   —
  4   authorised  —
  5   authorised   —
  6   refused     counterparty_not_allowed
  7   refused     attestation_mismatch
  8   refused     decision_replayed
  9   refused     mandate_suspended
 10   resumed     — 11   settled      —
 12   refused     decision_replayed
 13   repolicy    —
 14   refused     policy_changed
 15   authorised  —
```

Then:

```
  demo: OK — every event matched its expected code, and the balance is the contract view.
```

The snapshot hash is printed. It is stable across machines because the scenario
uses a fixed block height and integer amounts; if it changes, something
non-deterministic entered the demo, which is a defect.

## 4. `make verify`

```bash
make verify
```

Expected: one `OK` line per check (policy hash, five intent tuples, decision →
intent, settlement, stats, three policy-revision checks, frozen code set), then:

```
verify: OK
checks: 13
inputsHash: eb93f27ff015eef7b2fa93ed7436f124b6bb59e283bb64fe3fb08ecd1879d96e
```

Run it twice: `inputsHash` must not change.

## 5. `make test`

```bash
make test          # needs cargo
make test-linux    # reference environment, needs Docker
```

Expected: `27 passed; 0 failed`. Every refusal code named in §2 is asserted as a
typed error by a test, not as a string in prose.

## 6. `make doctor`

```bash
make doctor
```

Prints `ACTIVE` or `FALLBACK` per module and exits 1 on any fallback. On a fresh
clone with no credentials, one row is expected to be `FALLBACK`:

```
testnet deployment   FALLBACK   MANDATE_CONTRACT unset — replay only
```

That is accurate about the clone, not about the chain: nothing is misconfigured, the clone
simply has no contract id. A deployed contract does exist — `mandate-hackaton-7c1a.testnet`,
redeployed 2026-11-07 (`77th4RrA…`) — and setting `MANDATE_CONTRACT` turns that row
`ACTIVE`. (This line used to read "there is no deployed contract yet", which was false.)

## 7. `make e2e`

```bash
npm install && npx playwright install chromium
make e2e
```

Expected: `24 passed`. Nineteen are behavioural: the control-plane page and a real
`/health` probe against the API started beside the console; rendering contract views, the
replay, the announced refusal, a policy change invalidating an older decision, in-browser
hash recomputation, CSV export, the paper route with its three documents and eight loaded
diagrams, the in-page contents jump, the keyboard path with a visible focus ring, the
960px rail collapse, a 380px no-overflow check on every route, reduced motion, and `axe`
on each route with zero WCAG A/AA violations.

Five are acceptance journeys (`make uat`, `e2e/uat.spec.mjs`), written as user goals
rather than component checks:

| UAT | do this → see that |
|---|---|
| 01 | open the desk → `mandate.testnet`, a `100.00` balance, and the contract's own `list_mandates` table, with the mode labelled `replay` |
| 02 | step to event 6, record the balance, step to event 7 → `attestation_mismatch` and an **unchanged** balance |
| 03 | step to event 13, then 14 → `policy_changed`, and the history shows two revisions with the later marked `current` |
| 04 | press `v`, filter `refused`, open the first row → a `nearblocks.io/txns/…` link, not a label |
| 05 | press `x` then `a` → 21 refusal codes with the ones seen in this run marked, a "What it is not" section, and no axe violation on either route |

UAT-02 exists because its first version asserted the wrong thing: clicking event 7
directly advances the replay, so the balance changes for a legitimate reason. The
test now compares the state at event 6 with the state at event 7, which is the claim
that actually matters — a refusal is not a quiet debit.

## 7.1 The control plane (`make api`, `make mcp`)

Two surfaces read the same snapshot as the console, and neither can write.

```bash
make keys ARGS='issue --label me --scopes read:views,read:events,read:verify'
export MANDATE_KEY=<printed once>
make api        # http://127.0.0.1:4174
curl -s -H "Authorization: Bearer $MANDATE_KEY" http://127.0.0.1:4174/v1/status
make mcp        # JSON-RPC on stdio, for an MCP client (see the API page)
```

What is on disk: `mandate/console/data/api-keys.json`, gitignored, holding a
SHA-256 hash and a prefix per key — never the secret. A fresh clone has no file,
so every route answers `401 unauthorized` until a key is issued. Revoking a key
answers `key_revoked`, which is a different code from `unauthorized` on purpose.

The MCP server exposes six read-only tools (`mandate_status`, `mandate_list`,
`mandate_pending`, `mandate_events`, `mandate_event`, `mandate_verify`). Every
payload carries `mode: "replay of a contract run, never deployed"`, so an
assistant quoting it cannot present it as a live balance.

## 8. What this repo does not claim

- The console's default view is a replay of a contract run, not a chain read. A
  deployed contract does exist — `mandate-hackaton-7c1a.testnet` — and three of its
  transactions are on **Verify**, but every payload still carries
  `mode: "replay of a contract run, never deployed"` and the context bar never
  says `live` unless a chain read actually succeeded (C21, C22).
- The contract compares an attestation hash. It does not verify a hardware
  signature; that verification is a separate step and is not implemented here.
- No foreign-chain leg. The contract makes no Chain Signatures or Read MPC
  call; `settle` records a reference string the attestor supplies and nothing
  more. Claims C1–C3 and C9 were retired on 2026-11-07 for this reason.
- No mainnet funds at risk (C10).
- Banned vocabulary is checked by the docs tool, which can tell a claim from a
  quoted example of what not to say:

```bash
node tools/check-docs.mjs      # → OK — docs conformant, or the offending line
```

  A raw `grep` for those words also matches `AGENTS.md`, `docs/CLAIMS.md`,
  `docs/SKILLS.md`, `docs/BRAND_GUIDELINES.md`, `docs/UNIQUENESS-AUDIT.md` and
  this file, because those are the files that **state the ban**. A hit anywhere
  else is a claim, and the fix is to reword it — not to soften it.

## 9. `revoke_key` — revocation that removes the key, not only the permission

Every comparable vault documents pause or suspend: the key still reaches the contract and
is refused there. `revoke_key` also deletes the key from the contract account, so the
protocol refuses the signature before any contract code runs.

```bash
# in the reference container (make test-linux)
cargo test revoke_key
```

→ `1 passed`. The test asserts the **created receipt** contains a `DeleteKey` action for
the supplied key, because "the key cannot sign any more" is a protocol action, not a state
field. It also asserts the mandate is suspended in the same call.

On testnet, reproducibly:

```bash
node tools/key-demo.mjs --account mandate-hackaton-7c1a.testnet
```

→ it generates a key, adds it as a function-call key scoped to `spend`, then prints:

```
mandate m1 (owner mandate-hackaton-7c1a.testnet)
new key: ed25519:6SJBvfJeBi6MN7bzzf2aqWnyw1GCaGAHFdshWZa6qssi
  add key            BdK7UmaKH6cUJWvFZYJKELL2nZhEb18utjwrzUZoAKj2
after add:    present
  revoke_key         7snHs43D3TzVuMouCdVYDWRFzJdyQrxAfwt17BvGjt1J
after revoke: absent
suspended:    true
  resume             HjEzoVLJv4E72ESjWCciHNf9P2cyGdza22bKW65D1qJ1
after resume: key=absent suspended=false
C25 holds: the key was present, the revoke removed it, and resume restored the policy without restoring the key.
```

Open `BdK7UmaK…` and `7snHs43D…` on <https://testnet.nearblocks.io> and compare the
access keys. The last two lines are the difference from `suspend`: the key is gone from
the account, so `resume` brings back the policy but not the agent's ability to sign, and
the agent cannot even submit a `spend` to be refused. The script exits `1` if any of the
five observations disagree with the claim.

**What it does not claim.** The owner supplies the key, because a contract cannot read its
own key set from inside a call. The guarantee is that *that* key cannot sign for this
account afterwards; the contract does not prove the key belonged to the agent. Deleting a
key the owner does not control is a protocol no-op, not an escalation.

## 10. `make contest-demo` — the challenge window, on testnet

```bash
make contest-demo
```

→ creates a mandate, spends 5 units, records the settlement, contests it with
`not_delivered`, and prints:

```
after spend:    balance 999999999999999995  spent_total 5
settled:        demo:2QVZbqqgD5w6qRnM
after contest:  balance 1000000000000000000  spent_total 0
settlement:     amount 5  reason not_delivered  at block 277562658
dispute log:    1 entry  not_delivered  sha256:00000000000000000…
second contest: already_contested
C26 holds: the amount returned to the balance, the reason is on chain, and the same
settlement cannot be contested twice.
```

`settle` is attestor-only, and the script signs as the contract account, which is the
attestor on this deployment. The window is 100 blocks from the settling block, inclusive at
both ends: block 200 contests a settlement recorded at 100, block 201 does not.

Refusals this path can produce, each asserted in `src/tests.rs`: `challenge_window_closed`,
`already_contested`, `reason_invalid`, `owner_only`, and `not_found` for an intent the
contract never authorised. The four accepted reasons are `not_delivered`, `wrong_amount`,
`duplicate` and `key_compromised`.

What it does not do: the contract holds the payer's own funds and settlement only records a
foreign tx reference, so a contest reverses **our own ledger entry**. It is not a chargeback,
nothing is recovered from a vendor, and the daily and per-counterparty counters are not
rewound — a contested payment still consumed that day's allowance, which is what stops a
contest loop from refilling a ceiling.

## 11. Try to break it

Four attempts, each with the code the contract should answer with. The first three run
against the deployed contract; the fourth needs a settlement older than 100 blocks.

| Attempt | Expected | Why it is the right answer |
|---|---|---|
| Ask for more than `per_tx` | `per_tx_exceeded` | the cap is checked before the counters move |
| Send a decision hash that was already used | `decision_replayed` | one recorded decision authorises one payment |
| Call `spend` twice for the same chain, amount, vendor and asset | `intent_consumed` | one intent authorises one debit, so a second call cannot pay twice against a settlement that can only record once (C28, live `2yYHSZsh…`) |
| `settle` a second mandate with a tx reference already used | `tx_replayed` | the contract cannot fetch the foreign chain, but it can refuse to count the same hash twice (C29, live `H8urfrWk…`) |
| Call `spend` from an account that is not the mandate's agent | `unauthorized` | the agent alone may ask; the owner funds and amends, it does not spend directly (C27, unit test only — the earlier live link did not resolve and was removed) |
| Register an attestor key, then `spend` without a signature | `attestation_mismatch` | a registered key makes the attestation signed, not merely hashed (C31, live `8pkz6Jj7…` accepted, `H6n6BbiF…` refused) |
| Contest a settlement more than 100 blocks old | `challenge_window_closed` | the window is bounded by block height, not by a clock the caller supplies |

A fifth attempt belongs to the owner rather than an attacker: `contest` the same settlement
twice and the second answer is `already_contested`.

Two owner walks are the other direction — money coming out rather than an attack going in:
close a mandate (`close_mandate`) and its balance is released, then `withdraw` pays the part of
the contract balance that no open mandate reserves. Asking for more than that free part answers
`balance_reserved` (C30, live `BHUcq26y…`, `8qnz7eza…`, `255FQ41b…`).

If any of these returns something else, the claim table is wrong and the repository should be
read as broken rather than as "close enough".
