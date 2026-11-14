# BRAND GUIDELINES — Pledge & Mandate

> Two products, one visual system. The system's job: make a cryptographic claim look like an **instrument**, not a startup.
> Reference world: title deeds, survey instruments, chain-of-custody logs, notarial seals. Not "web3 dashboard".

---

## 1. Design direction (and what we refused)

The brief is money that can be *proven*. So the page behaves like a **document of record**: ruled surfaces, sequential verification stages, hash fragments in a monospace that looks stamped rather than displayed.

Rejected defaults, deliberately:
- ~~warm cream background + high-contrast serif + terracotta~~ (the AI-design default)
- ~~near-black + one acid accent~~ (also default, and it reads "trading terminal")
- ~~broadsheet hairline columns, zero radius, newspaper density~~ (it would fight the numbers)

**Chosen frame:** blueprint grey ground, ink text, one verdigris accent for "verified", one amber for "requires action", one oxide red for "blocked". The instrument-panel metaphor, not the terminal.

---

## 2. Palette

| Token | Hex | Use | Contrast on `--paper` |
|---|---|---|---|
| `--paper` | `#E9EEF3` | app ground | — |
| `--paper-raised` | `#F4F7FA` | cards, rails | 1.06:1 vs paper |
| `--ink` | `#0F1720` | primary text | **15.9:1** ✅ |
| `--ink-muted` | `#55636F` | secondary text | **5.6:1** ✅ |
| `--rule` | `#C3CDD6` | hairlines, table rules | 1.5:1 (decorative only) |
| `--verified` | `#2E6F5E` | verified / settled / GO | **5.4:1** ✅ |
| `--quorum` | `#2B5F8A` | in-flight / signing | **5.9:1** ✅ |
| `--pending` | `#A9660F` | needs human action | **4.9:1** ✅ |
| `--blocked` | `#A83A2C` | refusal / violation | **5.8:1** ✅ |

**Dark mode** (used only for the demo video backdrop, not the app): `--paper #0B1015`, `--ink #E8EFF5`, `--verified #58B39B`, `--quorum #6FA6D6`, `--pending #D9A24A`, `--blocked #E0766A`.

Rules: colour never carries meaning alone — every state also has a label and a glyph. Never use `--blocked` for anything but a refused or failed action.

## 3. Type

| Role | Face | License | Use |
|---|---|---|---|
| Display | **Fraunces** (variable, opsz) | OFL 1.1 | page titles, the one big number per screen. Weight 500–600, never below 28px |
| Body | **Public Sans** | OFL 1.1 | everything readable; government-document neutrality, deliberately unglamorous |
| Data | **JetBrains Mono** | OFL 1.1 | hashes, addresses, amounts, block numbers, proofs |

Scale (px): `12 / 13 / 15 / 17 / 21 / 28 / 38 / 52`. Line height 1.5 body, 1.15 display. Numbers always tabular (`font-variant-numeric: tabular-nums`), amounts always right-aligned, addresses always truncated `0xacme…4f2a` with full value on hover and copy.

Self-host via Fontsource; no Google Fonts CDN (privacy + the screener may run offline).

## 4. Layout

Two-zone instrument panel:

```
┌──────────────────────────────────────────────┬──────────────┐
│  CONTEXT BAR   network · contract · flag      │  PROOF RAIL  │
├──────────────────────────────────────────────┤              │
│                                              │  ① READ      │
│   PRIMARY CANVAS                             │   ✓ quorum   │
│   one decision per screen                    │   3/3        │
│                                              │  ─────────   │
│   [primary action, right-aligned]            │  ② ATTEST    │
│                                              │   pending    │
│                                              │  ─────────   │
│                                              │  ③ SIGN      │
│                                              │   —          │
│                                              │  ─────────   │
│                                              │  ④ SETTLE    │
│                                              │   —          │
├──────────────────────────────────────────────┴──────────────┤
│  FOOTER   active path: RPC_QUORUM · no mainnet · testnet      │
└─────────────────────────────────────────────────────────────┘
```

Grid: 12 col, 24px gutter, 1200px max, left canvas `8 col`, rail `4 col` (320px min). Rail collapses to a horizontal strip under the canvas below 960px. Radius: `2px` only — instruments have edges. Shadows: none; separation by rule weight and `--paper-raised`.

## 5. Signature element — the Proof Rail

The one thing the product is remembered by. Four cells, always in the same order, always showing **live** state:

| Stage | Shows | Truth it encodes |
|---|---|---|
| ① READ | `3/3 quorum` + tx ref | the fact came from outside, and how many sources agreed |
| ② ATTEST | code hash + quote state | what code decided |
| ③ SIGN | `11/17 threshold` + sig ref | who authorised |
| ④ SETTLE | chain + finality | where it landed |

A cell has exactly four states: `—` (not reached), `in flight` (pulsing dot, `--quorum`), `✓` (`--verified`), `✗` (`--blocked`). Clicking a cell opens the raw artefact. **It is never decorative**: if the underlying step did not happen, the cell stays empty. Fake progress in this rail is a firing offence.

## 6. Motion

Two animations, both load-bearing:
1. **Seal** (140ms, ease-out): when ② ATTEST transitions to `✓`, a single 1px verdigris rule draws across the cell and the hash settles 2px. Once per real transition.
2. **Rail cascade** (90ms stagger): on replay/demo, cells advance in sequence so a viewer can follow causality.

Everything else is instant. `prefers-reduced-motion: reduce` → seal becomes a 0ms state change. No parallax, no gradient shimmer, no typing effects.

## 7. Voice and microcopy

Notarial, plain, numeric. The interface is a clerk, not a salesperson.

| Instead of | Write |
|---|---|
| "Securely verify your assets!" | "3 of 3 RPCs agree this transfer happened." |
| "Something went wrong" | "Refused: `counterparty_not_allowed`. Add Acme to the allowlist, or lower the amount." |
| "Unhackable" | "The key cannot transfer. It can only call `spend`." |
| "Loading…" | "Reading Solana…" (then "Read: 3 of 3") |

Rules: sentence case; active voice; the button's word reappears in the result ("Revoke" → "Revoked"); errors state what happened, why, and the next action; never apologise; never use "!" in UI.

## 8. Tokens (paste into `tailwind.config` / CSS vars)

```css
:root{
  --paper:#E9EEF3; --paper-raised:#F4F7FA; --ink:#0F1720; --ink-muted:#55636F;
  --rule:#C3CDD6; --verified:#2E6F5E; --quorum:#2B5F8A; --pending:#A9660F; --blocked:#A83A2C;
  --r:2px; --gutter:24px; --max:1200px;
  --font-display:"Fraunces",serif; --font-body:"Public Sans",sans-serif; --font-mono:"JetBrains Mono",monospace;
  --step-0:15px; --step-1:17px; --step-2:21px; --step-3:28px; --step-4:38px; --step-5:52px;
}
```

## 9. Icons, assets, licences (all free-of-rights for commercial use)

| Asset | Source | Licence | Use |
|---|---|---|---|
| Icons | **Lucide** | ISC | default set; 1.5px stroke, 20px |
| Icons (alt) | **Phosphor** / **Tabler** | MIT | when Lucide lacks a glyph |
| Chain logos | **simple-icons** | CC0 | Solana, Base, Bitcoin, NEAR marks |
| Fonts | **Fraunces, Public Sans, JetBrains Mono** via Fontsource | OFL 1.1 | self-hosted |
| Illustration | **unDraw** | custom free | empty states only, recoloured to `--ink-muted` |
| Pattern | self-authored SVG | ours | the ruled ground |

Do **not** ship: brand logos outside simple-icons, stock photography, emoji as UI icons, anything with an unclear licence. Attribution file: `NOTICE.md` at repo root.

## 10. Driving Figma and Stitch

Both are installed on this machine. Workflow, cheapest first:

**A. Stitch (generate directions) — free tier, 350 generations/month**
1. `stitch.withgoogle.com`, signed in with the Google account already on this machine.
2. Paste the brief from §1–§5 of this document (not the whole file) as the prompt; ask for **the Pledge loan screen** and **the Mandate refusal screen** specifically. Generate 3 variants per screen.
3. Pick by one test: *does the proof rail survive at 960px?* Reject anything where verification state is decorative.
4. Export: **Copy to Figma** (editable layers) or HTML/Tailwind. Stitch also exports React/Vue/Angular/Flutter/SwiftUI — take Tailwind only, ignore the rest.

**B. Figma (own the source of truth)**
1. Desktop app → open the file → switch to **Dev Mode** with nothing selected.
2. Right sidebar → **Enable desktop MCP server**. It listens on `localhost:3845`.
3. Register it with the agent so code generation reads real components instead of screenshots:
   ```json
   { "mcpServers": { "figma": { "url": "http://127.0.0.1:3845/mcp" } } }
   ```
   Put that in `.cursor/mcp.json` (Cursor is installed) or the equivalent for the agent in use, restart the agent, then ask it for `get_code` on a selected frame.
4. Put the §2 and §3 values into Figma **Variables**, named exactly as the CSS tokens. Agents map variables → CSS vars without guessing.
5. If "Copy to Figma" mangles auto-layout, use the community plugin **Stitch to Figma** (HTML/CSS → auto-layout).

**C. Precedence**
`this file` > `tailwind.config` > Figma > Stitch output. If Figma disagrees with this document, Figma is wrong; fix the file, not the doc.

## 11. Accessibility floor (non-negotiable, judged as "design")

- Body contrast ≥ 4.5:1 (all pairs above pass), large text ≥ 3:1.
- Visible focus ring: 2px `--quorum` + 1px offset, on every interactive element.
- Full keyboard path through the demo: create → fund → refuse → spend → revoke.
- The refusal error is announced via `aria-live="polite"`; the proof rail uses `aria-live="off"` (it updates too often).
- No state conveyed by colour alone; every cell has text.
- Respect `prefers-reduced-motion`; no autoplay video with sound.
