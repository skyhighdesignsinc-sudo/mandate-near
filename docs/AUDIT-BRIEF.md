# Audit brief — paste this into Grok 4.7 (Cursor, max effort) and Kimi 3.1 (Kimi Code, max effort)

Purpose: two independent reviewers look at the two submissions and write down anything that
is a glitch, a nonsense claim, or a security problem. Their findings get diffed against
`docs/AUDIT-2026-11-14.md`, and whatever survives is fixed or recorded as open.

**Why a brief and not "audit this repo":** a reviewer with no context reviews the README
and stops. The failures worth finding here live in the gap between a sentence and the code
that is supposed to prove it, so the brief points at the pairs.

Run each reviewer on one repository at a time, in a separate session, with no access to the
other reviewer's output.

---

## Prompt (copy from here down)

You are reviewing a submission to NEAR HACKATHON 2026. It is at the root of this workspace
and the two published copies are `publish/mandate/` and `publish/baseline/`. Read
`AGENTS.md` first: it is the ruleset the author wrote for himself, including what he is not
allowed to claim.

Your job is adversarial review, not summarisation. Find:

1. **Broken artefacts.** Every transaction hash cited in any `.md` file must resolve on
   NEAR testnet. Check them (`node tools/check-evidence.mjs <file>` exists in both published
   trees; a public RPC is at `https://rpc.testnet.near.org`). Report every dead hash with
   the file and line.
2. **Claims the code does not support.** `docs/CLAIMS.md` is the list of sentences the
   author permits himself. For each claim, find the code or the transaction that proves it.
   If it does not, say which claim and what is actually true.
3. **Claims with no artefact.** Any sentence in a README, `JUDGE.md`, `SCREENER.md` or the
   console UI that asserts a behaviour with no test, no transaction and no command behind
   it.
4. **Glitches.** A command in a README that fails, a page that renders a number the contract
   did not return, a filter that miscounts, a demo whose output cannot be reproduced.
5. **Security.** In `mandate/contracts/mandate/src/lib.rs`: access control on every
   `&mut self` method, integer handling on balances and counters (`saturating_sub` hides a
   bug rather than fixing it — say when), re-entrancy across the promise/callback boundary,
   storage-key collisions, and whether a state transition can be repeated or reordered.
   The attestation is a hash comparison, not a signature check: say whether the C24
   disclosure is sufficient or whether the wording overstates it.
6. **Nonsense.** Numbers that cannot be what they say (a "day" measured in the wrong unit, a
   rate computed from one run, a percentage of a sample that is not stated), and any figure
   in prose that the dataset does not contain.

Rules for the report:

- Rank by severity: Critical / High / Medium / Low / Note.
- For each finding: file, line, what is wrong, what would be true instead, and how you
  checked. No finding without the check you ran.
- Do not report style, formatting or naming.
- Do not soften: if a claim is unprovable, say "unprovable" and stop.
- If a finding is only a suspicion, label it `SUSPECTED` and say what would confirm it.
- End with the three things you would fix first if the deadline were today.

Do not edit files. Report only.

## What to do with the output

1. Append each reviewer's findings to `docs/AUDIT-2026-11-14.md` under a heading naming the
   model and the date, unedited.
2. Mark each one `fixed`, `open (reason)` or `disputed (why)` — a dispute is allowed, a
   silent deletion is not.
3. Anything marked Critical that is still open at submission time goes in the README's
   "what this does not claim" section, in the same words the reviewer used.
