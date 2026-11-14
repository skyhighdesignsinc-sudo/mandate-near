// End-to-end and accessibility tests for the console.
//
// These run against the real static server and the real snapshot. They assert
// behaviour a screener can see: contract figures render, the replay changes them,
// a refusal is announced, the hashes recompute in the browser, the keyboard path
// works, the rail collapses under 960px, and axe finds no WCAG A/AA violation.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** @type {string[]} */
let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'The desk' })).toBeVisible();
});

test('renders contract views, not placeholders', async ({ page }) => {
  await expect(page.locator('#ctx-contract')).toHaveText('mandate.testnet');
  await expect(page.locator('#ctx-mode')).toContainText('replay');

  // The big number is a contract view: 100.00 at the start of the run.
  await expect(page.locator('.figure, .strip').first()).toContainText('100.00');

  // Fifteen events, each a button in the timeline.
  await expect(page.locator('.timeline button')).toHaveCount(15);

  // The mandate table came from list_mandates().
  await expect(page.getByRole('table', { name: /list_mandates/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('stepping the replay changes the money and the rail', async ({ page }) => {
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 1 of 15');
  await expect(page.locator('.strip')).toContainText('88.00');

  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 3 of 15');

  const rail = page.locator('#rail');
  await expect(rail).toContainText('AUTHORISE');
  await expect(rail).toContainText('pending');
  await expect(page.locator('#rail-foot')).toContainText('event 3 of 15');
});

test('a refusal is announced and names the typed code', async ({ page }) => {
  await page.locator('.timeline button').nth(6).click(); // event 7
  await expect(page.locator('#view h2').first()).toHaveText('Event 7 of 15');
  await expect(page.locator('#view')).toContainText('attestation_mismatch');

  const live = page.locator('#live');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toContainText('Refused with attestation_mismatch');

  // Colour is never the only signal: the rail cell carries the word too.
  await expect(page.locator('#rail li').nth(2)).toContainText('refused');
});

test('a policy revision invalidates decisions attested under the old one', async ({ page }) => {
  await page.locator('.timeline button').nth(12).click(); // event 13
  await expect(page.locator('#view h2').first()).toHaveText('Event 13 of 15');
  await expect(page.locator('#view')).toContainText('Re-policied');

  await page.locator('.timeline button').nth(13).click(); // event 14
  await expect(page.locator('#view')).toContainText('policy_changed');
  await expect(page.locator('#live')).toContainText('Refused with policy_changed');

  // The history is a contract view: two revisions, the second marked current.
  await page.getByRole('link', { name: 'Mandate', exact: true }).click();
  const table = page.getByRole('table', { name: /get_policy_history/ });
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('current');
});

test('verify recomputes the policy and intent hashes in the browser', async ({ page }) => {
  await page.getByRole('link', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Verify' })).toBeVisible();
  await expect(page.locator('#verify-status')).toContainText('agree', { timeout: 15_000 });
  await expect(page.locator('#verify-rows')).toContainText('policy_hash = sha256');
  await expect(page.locator('#verify-rows')).toContainText('intent = (chain, amount, vendor, asset)');
  await expect(page.locator('#verify-rows .state[data-state="fail"]')).toHaveCount(0);
});

test('exports the current contract rows as CSV', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export rows (CSV)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mandate-m1-event-\d+\.csv$/);
});

test('the keyboard path works and focus stays visible', async ({ page }) => {
  await page.keyboard.press('v');
  await expect(page.getByRole('heading', { level: 1, name: 'Verify' })).toBeVisible();

  await page.keyboard.press(']');
  await page.keyboard.press('[');
  await page.keyboard.press('d');
  await expect(page.getByRole('heading', { level: 1, name: 'The desk' })).toBeVisible();

  // The focused control must show a ring, not just a browser default outline of 0.
  await page.locator('body').press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, tag: el.tagName };
  });
  expect(ring).not.toBeNull();
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
  expect(ring.style).not.toBe('none');
});

test('the proof rail collapses below 960px and nothing scrolls sideways at 380px', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  const cols = await page.$eval('.app', (el) => getComputedStyle(el).gridTemplateColumns);
  expect(cols.split(' ').length).toBe(1);

  await page.setViewportSize({ width: 380, height: 900 });
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.inner + 1);

  const railCols = await page.$eval('#rail', (el) => getComputedStyle(el).gridTemplateColumns);
  expect(railCols.split(' ').length).toBe(1);
});

test('reduced motion turns the replay into a jump to the end', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Play replay' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 15 of 15', { timeout: 3_000 });
});

test('the help dialog opens and closes with Escape', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.locator('#help');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the control-plane page describes the API and probes it for real', async ({ page }) => {
  await page.keyboard.press('c');
  await expect(page.locator('#view-title')).toHaveText('Control plane');
  await expect(page).toHaveURL(/#\/api$/);
  await expect(page.getByRole('table', { name: /Routes and the one scope/ })).toBeVisible();
  await expect(page.locator('#view')).toContainText('mandate_verify');

  // The probe is a real request to the API started by playwright.config.mjs.
  await page.getByRole('button', { name: 'Check 127.0.0.1:4174' }).click();
  await expect(page.locator('#api-probe')).toHaveAttribute('data-state', 'ok', { timeout: 5_000 });
  await expect(page.locator('#api-probe')).toContainText('Running');
});

test('the paper route renders the markdown the repository ships', async ({ page }) => {
  await page.keyboard.press('w');
  await expect(page.locator('#view-title')).toHaveText('Paper');
  await expect(page).toHaveURL(/#\/paper$/);
  await expect(page.locator('.paper')).toHaveCount(3);
  await expect(page.locator('#doc-paper')).toContainText('Abstract');
  await expect(page.locator('#doc-diagrams .diagram')).toHaveCount(8);
  await expect(page.locator('#doc-diagrams img')).toHaveCount(8);
  // The images are lazy, so they are only decoded once shown: scroll first, then
  // wait for real pixels. A 404 would stay at naturalWidth 0 and fail here.
  await page.locator('#doc-diagrams').scrollIntoViewIfNeeded();
  await expect
    .poll(async () => page.$$eval('#doc-diagrams img', (imgs) => imgs.filter((i) => i.naturalWidth > 0).length), {
      timeout: 10_000,
    })
    .toBe(8);
  await expect(page.locator('#doc-architecture')).toContainText('Contract surface');
});

test('paper table of contents jumps inside the route', async ({ page }) => {
  await page.keyboard.press('w');
  await page.locator('.paper-toc .jump').nth(1).click();
  await expect(page).toHaveURL(/#\/paper$/);
  await expect(page.locator('#doc-architecture')).toBeInViewport();
});

test('no route scrolls sideways at 380px', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  for (const route of ['#/desk', '#/mandate', '#/verify', '#/refusals', '#/api', '#/paper', '#/about']) {
    await page.goto(`/${route}`);
    await expect(page.locator('#view')).not.toBeEmpty();
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(w.scroll, `horizontal overflow on ${route}`).toBeLessThanOrEqual(w.inner + 1);
  }
});

test('has no WCAG A or AA violations on any route', async ({ page }) => {
  const routes = ['#/desk', '#/mandate', '#/verify', '#/refusals', '#/api', '#/paper', '#/about'];
  for (const route of routes) {
    await page.goto(`/${route}`);
    await expect(page.locator('#view')).not.toBeEmpty();
    if (route === '#/verify') await expect(page.locator('#verify-status')).toContainText('agree', { timeout: 15_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(
      results.violations.map((v) => `${route} :: ${v.id} (${v.nodes.length}) — ${v.help}`),
      `axe violations on ${route}`,
    ).toEqual([]);
  }
});

test('the event log filters by outcome and the count is honest', async ({ page }) => {
  await expect(page.locator('.timeline li')).toHaveCount(15);

  const refusedChip = page.getByRole('button', { name: /^refused/ });
  const refused = Number((await refusedChip.locator('.chip-n').textContent()).trim());
  expect(refused).toBeGreaterThan(0);
  await refusedChip.click();

  await expect(page.locator('#event-filter-status')).toContainText(`Showing ${refused} of 15 events`);
  await expect(page.locator('.timeline li:visible')).toHaveCount(refused);
  await expect(refusedChip).toHaveAttribute('aria-pressed', 'true');

  // A filter is a view, not a jump: the replay cursor does not move.
  await expect(page.locator('#view h2').first()).toHaveText('Start of the run');

  await page.getByRole('button', { name: /^all events/ }).click();
  await expect(page.locator('.timeline li:visible')).toHaveCount(15);
  await expect(page.locator('#event-filter-status')).toContainText('Showing 15 of 15 events');
});

test('the on-chain card files runs, filters transactions and narrows to a mandate', async ({ page }) => {
  await page.keyboard.press('v');
  const runs = page.locator('details[data-run]');
  await expect(runs.first()).toBeVisible();

  const rows = page.locator('tr[data-tx-outcome]');
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(4);

  // The refused chip hides everything else and states exactly what is left.
  const refusedChip = page.getByRole('button', { name: /^refused/ });
  const refused = Number((await refusedChip.locator('.chip-n').textContent()).trim());
  await refusedChip.click();
  await expect(page.locator('#chain-filter-status')).toContainText(`Showing ${refused} of ${total}`);
  // Counted by the filter's own signal: rows inside a collapsed run are kept,
  // they are simply not painted until the run is opened.
  await expect(page.locator('tr[data-tx-outcome]:not([hidden])')).toHaveCount(refused);
  await expect(page.locator('tr[data-tx-outcome]:not([hidden])').first()).toContainText('attestation_mismatch');

  // Each refused row is openable evidence, not a label.
  const link = page.locator('tr[data-tx-outcome]:not([hidden]) a').first();
  await expect(link).toHaveAttribute('href', /nearblocks\.io\/txns\//);

  await page.getByRole('button', { name: /^all transactions/ }).click();
  await expect(page.locator('tr[data-tx-outcome]:not([hidden])')).toHaveCount(total);

  const options = page.locator('#chain-mandate option');
  expect(await options.count()).toBeGreaterThan(1);
  const id = await options.nth(1).getAttribute('value');
  await page.selectOption('#chain-mandate', id);
  const seen = await page.$$eval('tr[data-tx-outcome]:not([hidden])', (rs) => [...new Set(rs.map((r) => r.dataset.txMandate))]);
  expect(seen).toEqual([id]);
});

test('copy, print, pause and back-to-start each do their job', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.getByRole('link', { name: 'Mandate', exact: true }).click();
  await expect(page.locator('#view-title')).toHaveText('The mandate');

  const copy = page.getByRole('button', { name: 'Copy policy hash' });
  const hash = await copy.getAttribute('data-copy');
  await copy.click();
  await expect(page.locator('#live')).toHaveText('Policy hash copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(hash);

  // Print is stubbed: the assertion is that the button calls it, not that a
  // headless browser can produce paper.
  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => { window.__printed += 1; };
  });
  await page.getByRole('button', { name: 'Print receipt' }).click();
  expect(await page.evaluate(() => window.__printed)).toBe(1);

  await page.getByRole('link', { name: 'Desk', exact: true }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 2 of 15');
  await page.getByRole('button', { name: 'Back to start' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Start of the run');

  await page.getByRole('button', { name: 'Play replay' }).click();
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause replay' }).click();
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible();
});

test('the refusals and about routes render their own vocabulary', async ({ page }) => {
  await page.keyboard.press('x');
  await expect(page.locator('#view-title')).toHaveText('Refusals');
  await expect(page.locator('#view tbody tr')).toHaveCount(21);
  await expect(page.locator('#view')).toContainText('seen in this run');

  await page.keyboard.press('a');
  await expect(page.locator('#view-title')).toHaveText('About');
  await expect(page.locator('#view')).toContainText('What it is not');
});

test.afterEach(async () => {
  expect(pageErrors, 'console errors').toEqual([]);
});
