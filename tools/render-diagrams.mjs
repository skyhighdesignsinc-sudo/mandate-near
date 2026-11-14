// tools/render-diagrams.mjs — pre-render the Mermaid blocks in docs/UML.md to SVG.
//
// Why pre-render instead of shipping mermaid.min.js (~3.5 MB) to the page:
//   - the console stays dependency-free at runtime and works offline;
//   - the diagrams are images, so they are crawlable and need no JS to appear;
//   - `make docs` only reads the committed SVG, so a fresh clone never runs this.
//
// Running this file is the one step that needs a dependency (mermaid + the
// Chromium that `make e2e` already installs). It is not on the `make dev` path.
//
// Names are content-addressed (`d-<sha1-8>.svg`), the same formula build-docs.mjs
// uses, so editing a diagram orphans the old file instead of silently showing it.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SOURCE = 'docs/UML.md';
const OUT_DIR = 'mandate/console/data/diagrams';

const md = readFileSync(SOURCE, 'utf8');
const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => ({
  body: m[1].trim(),
  // The heading directly above the fence is the diagram's name.
  heading: md.slice(0, m.index).split('\n').reverse().find((l) => /^#{2,4}\s/.test(l))?.replace(/^#{2,4}\s+/, '') ?? 'Diagram',
}));

if (!blocks.length) {
  console.error(`no mermaid blocks in ${SOURCE}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div id="host"></div></body></html>');
await page.addScriptTag({ path: './node_modules/mermaid/dist/mermaid.min.js' });
await page.evaluate(() => {
  window.mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'strict',
    fontFamily: 'Georgia, "Times New Roman", serif',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#f4f7fa',
      primaryBorderColor: '#0f1720',
      primaryTextColor: '#0f1720',
      secondaryColor: '#e9eef3',
      tertiaryColor: '#ffffff',
      lineColor: '#55636f',
      textColor: '#0f1720',
      mainBkg: '#f4f7fa',
      nodeBorder: '#0f1720',
      clusterBkg: '#f4f7fa',
      clusterBorder: '#c3cdd6',
      edgeLabelBackground: '#ffffff',
      actorBkg: '#f4f7fa',
      actorBorder: '#0f1720',
      actorTextColor: '#0f1720',
      signalColor: '#0f1720',
      signalTextColor: '#0f1720',
      labelBoxBkgColor: '#f4f7fa',
      labelBoxBorderColor: '#0f1720',
      noteBkgColor: '#eef3f7',
      noteBorderColor: '#c3cdd6',
      // Sequence diagrams with five participants are drawn wide and then scaled
      // down to the page, so the source type is larger than the body text.
      fontSize: '18px',
    },
  });
});

mkdirSync(OUT_DIR, { recursive: true });
const written = new Set();

for (const [i, block] of blocks.entries()) {
  const name = `d-${createHash('sha1').update(block.body).digest('hex').slice(0, 8)}.svg`;
  // A fixed id per diagram keeps the emitted SVG byte-stable across runs.
  const svg = await page.evaluate(
    async ({ src, id }) => {
      const { svg } = await window.mermaid.render(id, src);
      return svg;
    },
    { src: block.body, id: `d${i + 1}` },
  );
  // Mermaid emits a fixed pixel width; make the image fluid so it never forces
  // the page to scroll sideways at 380px.
  const fluid = svg
    .replace(/width="[\d.]+"/, 'width="100%"')
    .replace(/<svg /, '<svg preserveAspectRatio="xMidYMid meet" ');
  writeFileSync(join(OUT_DIR, name), `${fluid}\n`);
  written.add(name);
  console.log(`  ${name}  ${block.heading}  (${(fluid.length / 1024).toFixed(1)} KB)`);
}

// Remove SVGs whose source block no longer exists, so the folder always matches
// the document and build-docs can never pick up a stale picture.
for (const file of readdirSync(OUT_DIR)) {
  if (file.endsWith('.svg') && !written.has(file)) {
    unlinkSync(join(OUT_DIR, file));
    console.log(`  removed stale ${file}`);
  }
}

await browser.close();
console.log(`diagrams: ${written.size} rendered from ${SOURCE} → ${OUT_DIR}`);
