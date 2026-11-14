# PENDING HUMAN — actions only the sponsor may take

> Agents cannot post publicly, sign mainnet transactions, or submit. Everything below is blocked on a human and is listed here so nothing is discovered on 14 November.

## Blocking submission (must be done by 2026-11-14 18:00 UTC)

| # | Action | Why it is human-only | Prep done |
|---|---|---|---|
| H-1 | Publish a public X post per project: says it was built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`, attaches the demo video | rule: human posts, agents never post | drafts produced at G5 (see `PM-PACK/16-project-review.md`) |
| H-2 | Confirm the exact submission JSON for each project | rule: print payload, wait for a yes | fields collected at G5 (see `PM-PACK/16-project-review.md`) |
| H-3 | Send `POST https://nearhackathon.com/api/applications` for each repo | rule: one attempt per repo; rejections are final | `requestId` generated once per submission, reused on retry |
| H-4 | Make both repos public | rule: private repos cannot be judged | licences + NOTICE prepared |
| H-5 | Provide a NEAR mainnet account for prize payout | rule: never invent an account | _needed_ |
| H-6 | Decide the team-size band for the form (`1` / `2 - 4` / `4 - 6` / `6 - 8` / `8+`) | only the sponsor knows the real team | default proposed: `4 - 6` |
| H-14 | Post the X thread for each project (draft in the 2026-11-13 note below) | rule: agents never post, even with a logged-in browser session | draft written |
| H-15 | Decide whether **both** repos are submitted, or only `baseline` | the field has twelve near-identical entries (see `UNIQUENESS-AUDIT.md` §4.2); the sponsor owns the strategy call | submit both, each disclosing the other |

## Needs a human decision (not blocking, but required before G3)

| # | Decision | Options | Default if no answer |
|---|---|---|---|
| H-7 | Is the Read MPC path available to a contract today, or do we ship the 3-RPC fallback as primary? | ask NEAR team · test it · ship fallback | ship fallback, labelled `FALLBACK` in the UI footer |
| H-8 | Do we have budget approval for ~$650 infra? | yes · cap lower | assume ≤ $650 approved |
| H-9 | Confirm the entity for the prize (APEXX Prime LLC?) | yes · other | APEXX Prime LLC as stated in the pitch book |
| H-10 | Who records the demo video? The script is written: `docs/DEMO-VIDEO.md`, two 80-second shot lists with narration, grounded in Q-012 | external · in-house | in-house: record the two scripts as written |
| H-16 | Confirm the copyright holder on `LICENSE` (added 2026-11-13 so Q-014 is satisfied) | the entity from H-9 · an individual | neutral "the authors of this repository" until H-9 is answered |
| H-17 | The name **Mandate** collides: four entries in this event are already called Mandate (`UNIQUENESS-AUDIT.md` §4.2, with X links). Rename the submission or keep it? | keep · rename the display name to Countersign · rename to Assay · another word | **keep** for this submission: the account `mandate-hackaton-7c1a.testnet` and 44 documents use the word, judges separate entries by repository URL, and a rename at this hour risks more than a duplicate name costs. Revisit for a public launch, not for the hackathon. |

## Needs credentials (never committed)

| # | What | Where it goes |
|---|---|---|
| H-11 | NEAR AI Cloud API key (cloud.near.ai) | local `.env` only |
| H-12 | RPC provider keys (3 per chain, for the quorum) | local `.env` only |
| H-13 | TEE worker host credentials (OutLayer/dstack) | local `.env` only |

## Notes

- Nothing in this file may be done by an agent, even if technically possible. The rules and the sponsor's trust both depend on that line holding.
- If an item here is still open on 2026-11-13, the submission is at risk. Escalate in writing the same day.

## 2026-11-06 — what is waiting on a human

**H-6 · deploy the Mandate contract to testnet — DONE 2026-11-06, no human needed.**
The faucet creates a funded account with no email, and `tools/deploy-testnet.mjs`
ran the whole thing: `mandate-hackaton-7c1a.testnet` is live, and
`make chain-demo` produced a real authorised spend, a real on-chain refusal and a
settlement (recorded in `mandate/console/data/chain.json`). Set
`MANDATE_CONTRACT=mandate-hackaton-7c1a.testnet` to make `make doctor` report
`testnet deployment ACTIVE`. The remaining human-only items are the ones in the
table above: publishing the repos, the X post, and the submission POST.

**H-7 · create the public repository and push.**
Nothing is committed yet — no git repository exists in this folder. The code, the console, the demo snapshot, the 27 contract tests and the 19 e2e tests are ready to commit; publishing and the submission form are the sponsor's actions (AGENTS §8).

**H-8 · record the demo video and post it on X.**
The scenario to film is events 1→12 in the console, then `make verify` in a terminal. `docs/CLAIMS.md` constrains the narration: no absolute security words, and every number shown must exist in `make demo` output.

**H-9 · CLOSED 2026-11-07 — Bond is withdrawn, submission #2 is the measured baseline** (D-019).
The uniqueness re-check found Bond's mechanism shipped by seven products, one of them
NEAR AI's own Agent Market, so the 2026-11-08 compile test no longer decided anything.
What the sponsor now owes is one more public repo when it exists (H-4) and one more X
post (H-1); no action is needed before 2026-11-12.

**H-10 · choose the product name before the repository becomes public.** "Mandate" is already used for agent spending authority by at least four projects (`docs.mandate.md`, `mandate.help`, `runmandate.xyz`, `mandate-agent.com`), and NEAR's own Intents Agent API occupies the adjacent space. Renaming touches the repo name, `projectUrl`, the wordmark, the docs titles and the console context bar, so it needs one decision and one batch — not a unilateral edit by an agent (D-015). Until it is decided, the whitepaper calls the name a working title.

## 2026-11-13 — post-freeze: what is left for a human

**State.** Code freeze (2026-11-11) has passed; submission closes 2026-11-14 23:59 UTC.
Both repositories are demo-complete on testnet and no new product surface will be added
(`DECISIONS.md` D-021). The items below cannot be done by an agent.

**H-14 · X drafts.** Post only after the demo URL is public; tag `@NEARProtocol` and
`#NEARHackathon`. The browser session is signed in, and that changes nothing: posting is
the sponsor's act, not the agent's.

`baseline`:
> Every team at NEAR Hackathon built an agent spending policy. We measured one. The daily
> ceiling on a contract we deployed was 86.4 milliseconds long, so a 25 USDC cap authorised
> 30 USDC across two blocks. Found by a scripted matrix, fixed, redeployed, re-measured:
> 10 attempts, 6 refusals, every hash public.

`mandate`:
> An agent's budget is a contract balance, and the reason for each spend is a decision hash
> the contract checks before it moves money. Two refusals in this run are real failed
> testnet transactions you can open yourself: `attestation_mismatch` and `policy_changed`.

Neither draft claims novelty in spending limits. That claim is false — see
`UNIQUENESS-AUDIT.md` §4.2, which lists twelve entries in this event alone.

**H-15 · submission scope.** Both repos may be submitted (two are allowed, each README
naming the other). If only one is sent, send `baseline`: the field has twelve of the other.
