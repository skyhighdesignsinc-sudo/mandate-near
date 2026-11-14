# Generated screens — Mandate & Bond

Reference designs produced with Google Stitch from `tools/stitch-screens.mjs`.

**These are reference, not source of truth.** Precedence stays as `docs/BRAND_GUIDELINES.md` →
`tailwind.config` → Figma → Stitch output. If a screen disagrees with the brand document, the
screen is wrong and gets regenerated, not the document.

## What is here

| App | Screen | What it has to prove |
|---|---|---|
| Mandate | `01-overview` | the console is a register: two mandates, funded balances, today's spend, refusals |
| Mandate | `02-mandate-detail` | the key scope panel — "the key cannot transfer, it can only call spend" — next to a live decision log and the suspend control |
| Mandate | `03-spend-composer` | the agent's own view: decision hash previewed over normalised fields, six named policy checks |
| Mandate | `04-escalation` | a spend above the cap parks as a pending request; the approval is its own transaction |
| Mandate | `05-refusal` | a refusal is a first-class screen: code, why, next action, and a proof rail with two deliberately empty cells |
| Mandate | `06-audit` | export plus a recomputable hash, so the CSV is checkable without trusting the page |
| Bond | `01-borrower-overview` | collateral on three chains, none of it bridged, one credit line |
| Bond | `02-lock-collateral` | three RPC providers read the same UTXO; "what did not happen" panel |
| Bond | `03-draw` | quote, then an 11-of-17 signer grid |
| Bond | `04-statement` | per-event proof links and a contract-computed interest footnote |
| Bond | `05-closeout` | seizure by threshold signature, borrower alert emitted before execution |
| Bond | `06-desk-view` | the lender's day: four lines, one breaching, one stale read, one close-out queued |
| Mandate | `07-first-run` | the empty state still reads as an instrument; the rail is empty because nothing happened |
| Mandate | `08-verify-drawer` | the three steps a sceptic runs: recompute, compare, check the signer |
| Mandate | `09-policy-editor` | a policy change is an amendment with a diff, not a settings toggle |
| Mandate | `10-kill-switch-confirm` | suspension explained as two transactions, including what keeps running |

Each screen is `<id>.png` (the rendered design) and `<id>.html` (Stitch's Tailwind-ish markup).
`index.html` is the gallery; `manifest.json` records the project ids, screen ids and timings.

## Regenerate

```bash
node tools/stitch.mjs                      # both apps, all screens
node tools/stitch.mjs --only mandate       # one app
node tools/stitch.mjs --only mandate --screen 05-refusal
```

Needs `STITCH_API_KEY` in `mandate/.env` (gitignored) or the environment. Generation is billed
per screen and is not idempotent: the runner never retries, it records failures in
`manifest.json` and exits non-zero.

## Three API facts worth keeping

1. `generate_screen_from_text` returns the finished screens **inside its own response**
   (`result.outputComponents[].design.screens[]`). `list_screens` returns `{}` for these
   projects, so polling it for new screens always finds nothing.
2. `screenshot.downloadUrl` and `htmlCode.downloadUrl` are absolute URLs that accept the same
   `X-Goog-Api-Key` header as the MCP endpoint.
3. **Those URLs do not return the file.** They return a JSON envelope:
   `{"imageMetadata":{"mimeType":"png"},"dataString":"<base64>"}` for a screenshot and
   `{"dataString":"<!DOCTYPE html>…"}` for the code. Writing the response body straight to a
   `.png` produces a ~600 KB file that no browser can draw — every image in the gallery was
   broken until this was caught. Decode `dataString`: base64 for images, UTF-8 for HTML.
