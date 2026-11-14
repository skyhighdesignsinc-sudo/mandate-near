// tools/audit-design.mjs — measure how far the generated screens drift from the brand tokens.
//
// The design source of truth is docs/BRAND_GUIDELINES.md §2 and §3. This does not judge
// beauty; it counts hex colours outside the palette, fonts that are not the three licensed
// faces, and shadow declarations, because those are the three ways Stitch drifts in practice.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const designDir = resolve(root, 'design');

const PALETTE = new Set([
  '#e9eef3', '#f4f7fa', '#0f1720', '#55636f', '#c3cdd6',
  '#2e6f5e', '#2b5f8a', '#a9660f', '#a83a2c',
  // neutrals a design legitimately needs for hairlines and text on raised panels
  '#ffffff', '#000000', '#ffffff00', '#e8eff5', '#0b1015',
]);

const FONTS = ['fraunces', 'public sans', 'jetbrains mono'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.html') ? [p] : [];
  });
}

const rows = [];
for (const path of files(designDir).sort()) {
  const html = readFileSync(path, 'utf8');
  const hexes = (html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase());
  const unique = [...new Set(hexes)];
  const offPalette = unique.filter((h) => !PALETTE.has(h));
  const usedFonts = FONTS.filter((f) => new RegExp(f, 'i').test(html));
  const shadows = (html.match(/box-shadow/gi) ?? []).length;
  const radius = [...new Set((html.match(/border-radius:\s*([^;]+);/gi) ?? []).map((s) => s.split(':')[1].trim().replace(';', '')))];
  const id = path.replace(designDir, '').replace(/\\/g, '/').replace(/^\//, '');
  rows.push({ id, colors: unique.length, off: offPalette.length, offList: offPalette.slice(0, 4), fonts: usedFonts, shadows, radius: radius.slice(0, 5) });
}

console.log('id'.padEnd(30), 'colours', 'off-palette', 'fonts', 'shadows');
for (const r of rows) {
  console.log(
    r.id.padEnd(30),
    String(r.colors).padStart(7),
    String(r.off).padStart(11),
    String(r.fonts.length).padStart(5),
    String(r.shadows).padStart(7),
    r.off ? `  off: ${r.offList.join(' ')}` : '',
  );
  if (r.fonts.length < 3) console.log(`  missing font: ${FONTS.filter((f) => !r.fonts.includes(f)).join(', ')}`);
}

const bad = rows.filter((r) => r.off > 0 || r.fonts.length < 3);
console.log('');
console.log(bad.length === 0
  ? 'All screens use only palette colours and the three licensed faces.'
  : `${bad.length} of ${rows.length} screens drifted (see rows above).`);
process.exit(bad.length === 0 ? 0 : 1);
