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
| A spend by an account that is not the agent is refused `unauthorized`, balance unchanged | `3aqb32W9HmseTg5VuwY6Zr4JKPsaK3q9dajKWig8nFDp` |
| A settled payment is contested, the amount returns, a second contest is refused | `4vGSHH9oj7PSun7x9oJJzPK6GUkxBTvjGHdf7XELg8bt` |
| A "day" that was 86.4 ms long, found by the matrix and fixed | `G1JZHxASLm14U9UaLuHcLVsUymW59HwpthuHTLg6xM2d` (before), `E8cYASoLZanuZGtaA6e766wnGNzdhV1QFsYCvjyCcny3` (after) |

All on testnet, all reachable at `https://testnet.nearblocks.io/txns/<hash>`.

## One command each

```bash
make contest-demo     # prints "C26 holds" or fails
make thesis-e2e       # 24 rows, 16 refusals, one run — artefacts agree
```

`make contest-demo` writes to testnet (one mandate). `make thesis-e2e` is offline and needs no
key. Neither reads a secret.

## What is actually different, measured against the nearest eleven entries

Audited 2026-11-13 against the eleven most comparable repositories; method and per-project rows
in `docs/UNIQUENESS-AUDIT.md` §4.4 and the full 1,098-entry census in §4.7.

| Mechanism | In the field | Here |
|---|---|---|
| Spending caps, allowlist, per-day ceiling | 11 of 11 | yes |
| Typed refusal code left in the failed receipt | common | yes, and the matrix exercises all 16 |
| `settle` records a foreign tx reference | common | yes |
| **Key deleted on revoke, not just paused** | **0 of 11** | yes (C25, live `7snHs43D…`) |
| **Contest window on a settled payment** | **0 names in 1,098** | yes (C26) |
| Caller bound to the named agent | not claimed as unique | yes (C27) |
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
