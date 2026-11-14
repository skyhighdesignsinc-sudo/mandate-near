# Third-party notices

This repository ships no third-party code at runtime. The console is hand-written
HTML, CSS and JavaScript with no imports, and it works offline.

## Development-only dependencies

| Package | Licence | Used for | Ships to the browser? |
|---|---|---|---|
| `@playwright/test` | Apache-2.0 | the e2e and accessibility suite (`make e2e`) | no |
| `@axe-core/playwright` | MPL-2.0 | WCAG checks inside that suite | no |
| `mermaid` | MIT | pre-rendering `docs/UML.md` into SVG (`make diagrams`) | no — only the resulting SVG files are committed |

`tools/render-diagrams.mjs` runs Mermaid in the Chromium that Playwright already
installs, writes `mandate/console/data/diagrams/*.svg`, and exits. The page then
loads those files as images; `mermaid.min.js` (about 3.5 MB) is never served.

Regenerating the diagrams needs `npm install`; reading the site does not. A fresh
clone that only runs `make dev` uses the committed SVGs.

## Fonts

No font files are bundled. The stylesheet names licensed families first (see
`docs/DECISIONS.md` D-012) and falls back to system stacks, so the page renders
without a network request for type.

## Images

The wordmark and favicon are inline SVG drawn for this project, not a third-party
icon set. The console screenshots under `mandate/console/data/` are captures of
this page.
