import { expect, test } from '@playwright/test';

/**
 * The privacy promises that can be checked in a browser, checked in one.
 *
 * "No cookies" is printed in every page's footer, the README, the social card
 * and the promo video, and until this file nothing tested it. A promise nobody
 * tests is a promise that becomes false the day someone adds a script.
 *
 * What is asserted is what is true on 2026-10-06, and that is the point of
 * writing it down: when analytics with cookies, accounts or a sponsor are
 * added, these tests fail on purpose, and the fix is to rewrite the promises
 * (README, privacy page, footer, social card, store listings) in the same
 * release and then change the assertion — never to loosen the assertion alone.
 *
 * The built site is served locally, where Cloudflare's Web Analytics beacon is
 * never injected (it is added at the edge), so the visitor counter is not
 * exercised here; its behaviour was checked against the live site: it reports
 * the page's address without the query string or fragment.
 */

/** One of each kind of page a visitor can land on. */
const PAGES = ['/', '/models/claude-opus-5/', '/free-tiers/', '/receipt/'] as const;

/** Every localStorage key the site may write, and why. Anything else is new. */
const INTERFACE_KEYS = new Set([
  'ps.theme', // light or dark
  'ps.accent', // the accent colour
  'ps.canvas', // the page background
  'ps.welcomeDismissed', // the welcome banner was closed
  'ps.appsLiveBannerDismissed', // the apps banner was closed
]);

const HOW_TO_FIX =
  'If this is deliberate (analytics with cookies, accounts, sponsors), rewrite the public promises first ' +
  '(README, privacy page, footer, social card, store listings) and then update this test in the same release.';

for (const path of PAGES) {
  test(`${path} sets no cookie and stores nothing until a setting changes`, async ({ page, context }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    expect(await context.cookies(), `cookies were set. ${HOW_TO_FIX}`).toEqual([]);
    expect(await page.evaluate(() => document.cookie), 'document.cookie is not empty').toBe('');

    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(
      keys.filter((key) => !INTERFACE_KEYS.has(key)),
      `unexpected localStorage keys. ${HOW_TO_FIX}`,
    ).toEqual([]);
    expect(await page.evaluate(() => Object.keys(sessionStorage)), 'sessionStorage is used').toEqual([]);
    expect(
      await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0),
      'IndexedDB is used',
    ).toBe(0);
  });
}

test('changing a setting stores only interface choices, and still no cookie', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
  const welcome = page.getByRole('button', { name: /close|dismiss|got it/i }).first();
  if (await welcome.isVisible().catch(() => false)) await welcome.click();

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.length, 'switching the theme should have stored the choice').toBeGreaterThan(0);
  expect(
    keys.filter((key) => !INTERFACE_KEYS.has(key)),
    `unexpected localStorage keys. ${HOW_TO_FIX}`,
  ).toEqual([]);
  expect(await context.cookies(), `cookies were set. ${HOW_TO_FIX}`).toEqual([]);
});

test('talks only to this site and the LaunchNest badge', async ({ page, baseURL }) => {
  const hosts = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.host);
  });
  for (const path of PAGES) await page.goto(path, { waitUntil: 'networkidle' });

  const here = new URL(baseURL!).host;
  const others = [...hosts].filter((host) => host !== here && host !== 'launchnest.io');
  expect(others, `a request went somewhere unlisted. ${HOW_TO_FIX}`).toEqual([]);
});

test('a private token in the address is removed from it once the page has read it', async ({ page }) => {
  // Alert links arrive as /?alerts=<token>. The token must not sit in the
  // address bar (and so in history, screenshots and analytics) any longer than
  // it takes the page to read it.
  await page.goto('/?alerts=TEST-TOKEN-NOT-REAL');
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.url(), { timeout: 10_000 }).not.toContain('TEST-TOKEN-NOT-REAL');
});
