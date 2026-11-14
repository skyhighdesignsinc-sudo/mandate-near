# Ninety seconds

Two submissions, kept apart on purpose. This file is the fast path for a reviewer who has a
thousand entries to read.

| | |
|---|---|
| **`mandate`** | An agent gets a budget and an allowlist the contract enforces, an attested reason for every spend, a kill switch that deletes the agent's key, and a 100-block window in which a settled payment can be contested. |
| **`baseline`** | The measurement: we ran a policy contract against 24 cases to see which refusals actually bind, found that one did not, fixed it, and published every hash. |

They are not the same project twice. One is the product; the other is the instrument that says
whether products like it refuse what they claim.

## Three transactions, clicked not claimed

| What it proves | Transaction |
|---|---|
| A 12.00 spend inside the cap is authorised and the balance moves | `8kBeNySH1fRpwHTWPQ15oGubgdDdQcu5RVunu1V13cbU` |
| A 7.00 spend whose attestation was computed for 8.00 is refused `attestation_mismatch` | `Vumoz6Dnb2ea6jpLwiSVXvvR6jAcbLuRyW3BwFyzwLd` |
| The authorised intent is settled against a foreign transaction reference | `Gq1xnDJQgqoyyXqXXN7orpUDgH488hTFeSnyWceZdBh8` |
| The matrix's per-counterparty refusal, from the 24-case run | `Awq7ureY5RmC17c7pw6pp4FFzMmV6kJ1nZouyTBZSaJF` |

All on testnet, all reachable at `https://testnet.nearblocks.io/txns/<hash>`. Every hash in this
file is machine-checked: `node tools/check-evidence.mjs JUDGE.md` exits non-zero if one of them
stops resolving, which is how the previous set — well-formed ids that opened to nothing — was
caught.

## One claim is currently withdrawn, and why

The contest window is implemented and unit-tested, but `tools/contest-demo.mjs` now fails its own
assertion (`C26 FAILED: the observed states do not match the claim`), so **C26 is not claimed in
this submission**. The caller check introduced in C27 is covered by the contract's unit test
(`only_the_named_agent_can_request_a_spend`) and by no live link in this file yet. Both are listed
here rather than quietly deleted, because a judge who greps the repository will find them.

## Open the console before you read anything

**https://skyhighdesignsinc-sudo.github.io/mandate-near/** — static page, no server, no key.
Step the run with the arrow keys; event 02 is a 45.00 attempt refused against a 40.00
per-counterparty ceiling, with the balance sitting unchanged at 88.00.
A 61-second recording of that same page is at `media/mandate-journey.mp4`.

## One command each

```bash
make thesis-e2e       # 24 rows, 16 refusals, one run — artefacts agree
node tools/check-evidence.mjs thesis/data/spends.json   # every cited hash resolves, or exit 1
```

`make thesis-e2e` is offline and needs no key. `check-evidence` needs a public RPC and no key.
Neither reads a secret.

## What is actually different, measured against the nearest eleven entries

Audited 2026-11-13 against the eleven most comparable repositories; method and per-project rows
in `docs/UNIQUENESS-AUDIT.md` §4.4 and the full 1,098-entry census in §4.7.

| Mechanism | In the field | Here |
|---|---|---|
| Spending caps, allowlist, per-day ceiling | 11 of 11 | yes |
| Typed refusal code left in the failed receipt | common | yes, and the matrix exercises all 16 |
| `settle` records a foreign tx reference | common | yes |
| **Key deleted on revoke, not just paused** | **0 of 11** | implemented (C25) |
| **Contest window on a settled payment** | **0 names in 1,098** | implemented, withdrawn from this submission (C26) |
| Caller bound to the named agent | not claimed as unique | implemented, unit-tested (C27) |
| Pre-flight dry run before signing | 1 of 11 (`agentshield`) | no |
| Key expiry / lease | 1 of 11 (`leash-near`) | no |

The last two rows are there on purpose. A comparison table that only lists your wins is
advertising.

## Try to break it

`mandate/docs/SCREENER.md` §11 lists four attempts with the code each should answer with:
over-cap (`per_tx_exceeded`), replayed decision (`decision_replayed`), wrong caller
(`unauthorized`), late contest (`challenge_window_closed`). If one returns something else, the
claim table is wrong and you should read the repository as broken.

## What we do not claim

No mainnet, no audit, no custody. The attestor is a trusted component: the contract compares a
hash and does not verify a signature (C24). A contest reverses our own ledger entry; it is not a
chargeback. The dispute log has a contract view and a CLI demo but no console surface yet.
Settlements migrated from before the window existed cannot be contested, because their amount
was never stored.

## Why the claims can be checked at all

`docs/CLAIMS.md` is the only list of sentences allowed in a README, a UI or a video, and every
row names the artefact that proves it. `make verify` recomputes the hashes; `make thesis-e2e`
fails when the prose and the dataset disagree. The release profile is compiled with
`panic = "abort"`, so a refusal's message is gone by the time a node reports it — the code
survives in the receipt log, which is why every refusal is greppable on chain.
