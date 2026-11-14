// UAT — acceptance tests written as user journeys, not as component checks.
//
// `mandate.spec.mjs` asserts that the console behaves. This file asserts that a
// person with a job to do can do it, in the order they would do it, and that the
// money on screen tells the truth at each step:
//
//   UAT-01  a judge checks the balance without trusting our page
//   UAT-02  an owner watches a refusal change nothing
//   UAT-03  an owner confirms a re-policy blocks an in-flight decision
//   UAT-04  a reviewer finds the failed transaction and opens it on the explorer
//   UAT-05  a sceptic reads the refusal vocabulary and what the product is not
//
// Every assertion below is reachable by clicking. No fixtures are invented here:
// the console serves the snapshot a contract run produced.

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

test.afterEach(async () => {
  expect(pageErrors, 'console errors').toEqual([]);
});

test('UAT-01 a judge can check the balance and the account without trusting the page', async ({ page }) => {
  // 1. The account is named on screen, in the form an explorer accepts.
  await expect(page.locator('#ctx-contract')).toHaveText('mandate.testnet');

  // 2. The headline balance is a contract view, and it is the start-of-run figure.
  await expect(page.locator('.strip')).toContainText('100.00');

  // 3. The table is the contract's own list, not a hand-written sample.
  const table = page.getByRole('table', { name: /list_mandates/ });
  await expect(table).toBeVisible();
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThan(0);

  // 4. The run says how it was produced, so "replay" is never mistaken for "live".
  await expect(page.locator('#ctx-mode')).toContainText('replay');
});

test('UAT-02 an owner watches a refusal leave the balance untouched', async ({ page }) => {
  const balance = page.locator('.strip');

  // Walk to the event before the refusal so the comparison is "state at 6" against
  // "state at 7". Clicking event 7 directly would advance the replay through events
  // 1-6 and change the balance for a legitimate reason — which is exactly what the
  // first version of this test wrongly asserted against.
  for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 6 of 15');
  const before = (await balance.textContent()) ?? '';

  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#view h2').first()).toHaveText('Event 7 of 15');
  await expect(page.locator('#view')).toContainText('attestation_mismatch');

  // The claim: a refusal is not a quiet debit. The figure is identical before and
  // after, because nothing moved.
  expect((await balance.textContent()) ?? '').toBe(before);

  // And the refusal is announced, not only coloured.
  await expect(page.locator('#live')).toContainText('Refused with attestation_mismatch');

  // The rail states the same fact in words.
  await expect(page.locator('#rail li').nth(2)).toContainText('refused');
});

test('UAT-03 an owner confirms a re-policy blocks a decision made under the old one', async ({ page }) => {
  // 13 revises the policy, 14 tries to spend under the decision taken before it.
  await page.locator('.timeline button').nth(12).click();
  await expect(page.locator('#view')).toContainText('Re-policied');

  await page.locator('.timeline button').nth(13).click();
  await expect(page.locator('#view')).toContainText('policy_changed');
  await expect(page.locator('#live')).toContainText('Refused with policy_changed');

  // The history is a contract view: two revisions, the later one marked current.
  await page.getByRole('link', { name: 'Mandate', exact: true }).click();
  const history = page.getByRole('table', { name: /get_policy_history/ });
  await expect(history.locator('tbody tr')).toHaveCount(2);
  await expect(history).toContainText('current');
});

test('UAT-04 a reviewer finds the failed transaction and opens it on the explorer', async ({ page }) => {
  await page.keyboard.press('v');

  const refusedChip = page.getByRole('button', { name: /^refused/ });
  const refused = Number((await refusedChip.locator('.chip-n').textContent())?.trim());
  expect(refused).toBeGreaterThan(0);
  await refusedChip.click();
  await expect(page.locator('#chain-filter-status')).toContainText(`Showing ${refused} of`);

  // What remains is only evidence: a typed code and a link off this server.
  const rows = page.locator('tr[data-tx-outcome]:not([hidden])');
  await expect(rows).toHaveCount(refused);
  await expect(rows.first()).toContainText('attestation_mismatch');
  await expect(rows.first().locator('a')).toHaveAttribute('href', /nearblocks\.io\/txns\/[1-9A-HJ-NP-Za-km-z]{43,44}$/);

  // The filter is a view, not a claim about the run: clearing it restores every row.
  await page.getByRole('button', { name: /^all transactions/ }).click();
  expect(await page.locator('tr[data-tx-outcome]:not([hidden])').count()).toBeGreaterThan(refused);
});

test('UAT-05 a sceptic reads the refusal vocabulary and what the product is not', async ({ page }) => {
  await page.keyboard.press('x');
  await expect(page.locator('#view-title')).toHaveText('Refusals');

  const codes = page.locator('#view tbody tr');
  await expect(codes).toHaveCount(21);
  await expect(page.locator('#view')).toContainText('seen in this run');

  // The page must distinguish a code the run produced from one only asserted by a test.
  const seen = await page.locator('#view').innerText();
  expect(seen).toMatch(/attestation_mismatch/);
  expect(seen).toMatch(/policy_changed/);

  await page.keyboard.press('a');
  await expect(page.locator('#view-title')).toHaveText('About');
  await expect(page.locator('#view')).toContainText('What it is not');

  // UAT ends where a hostile reviewer does: no WCAG A/AA violation on these two routes.
  for (const route of ['#/refusals', '#/about']) {
    await page.goto(`/${route}`);
    await expect(page.locator('#view')).not.toBeEmpty();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${route} :: ${v.id}`), `axe on ${route}`).toEqual([]);
  }
});
