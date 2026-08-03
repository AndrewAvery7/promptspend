import { expect, test } from '@playwright/test';
import { horizontalOverflow, report, smallTouchTargets, tinyText } from './lib/audit';

/**
 * Mobile layout, checked on every commit instead of by squinting.
 *
 * The unit suite proves the cost engine is right and the copy is present. It
 * runs in jsdom, which has no layout engine at all — it cannot tell you that
 * the rate table pushes the page sideways at 320px, or that a checkbox is 20px
 * under a thumb. Both of those shipped here and both were found by a person.
 *
 * Every check runs on every project in `playwright.config.ts`, so a regression
 * at one width fails loudly and names the element.
 */

/** The app's four views, reached through the nav rather than by URL. */
const VIEWS = ['Estimate', 'Compare', 'Learn', 'Data & Alerts'] as const;

/** Generated pages — now the majority of what a visitor lands on. */
const GENERATED = [
  { path: '/models/', name: 'model index' },
  { path: '/models/claude-opus-5/', name: 'a model page' },
  { path: '/providers/anthropic/', name: 'a provider page' },
  { path: '/compare/', name: 'the comparison index' },
] as const;

test.describe('the app', () => {
  for (const view of VIEWS) {
    test(`${view} fits its viewport`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: view, exact: true }).click();
      // The catalog loads over the network; wait for content, not a timer.
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');

      const offenders = await horizontalOverflow(page);
      expect(offenders, report('elements push the page sideways', offenders)).toEqual([]);
    });
  }

  test('every tap target is big enough for a thumb', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the 44px rules live behind @media (pointer: coarse)');
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const offenders = await smallTouchTargets(page);
    expect(offenders, report('tap targets are under 44px', offenders)).toEqual([]);
  });

  test('nothing renders below 12px', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const offenders = await tinyText(page);
    expect(offenders, report('pieces of text are under 12px', offenders)).toEqual([]);
  });

  test('a wide table scrolls itself, not the page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.locator('table.catalog')).toBeVisible();

    const state = await page.evaluate(() => {
      const table = document.querySelector('table.catalog');
      const wrap = table?.closest('.table-wrap');
      return {
        pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        wrapScrolls: wrap ? getComputedStyle(wrap).overflowX : null,
      };
    });

    expect(state.wrapScrolls, 'the table needs a scrolling container').toMatch(/auto|scroll/);
    expect(state.pageScrolls, 'the table must not widen the document').toBe(false);
  });
});

test.describe('the generated pages', () => {
  for (const { path, name } of GENERATED) {
    test(`${name} fits its viewport`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should exist`).toBe(200);

      const offenders = await horizontalOverflow(page);
      expect(offenders, report('elements push the page sideways', offenders)).toEqual([]);

      const small = await tinyText(page);
      expect(small, report('pieces of text are under 12px', small)).toEqual([]);
    });
  }

  test('a model page is readable with no JavaScript at all', async ({ browser }) => {
    // These pages ship none, and that is the point: they have to be complete
    // in the HTML for a crawler and for anyone on a hostile network.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/models/claude-opus-5/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('pricing');
    await expect(page.getByText('$5', { exact: false }).first()).toBeVisible();
    const offenders = await horizontalOverflow(page);
    expect(offenders, report('elements push the page sideways', offenders)).toEqual([]);

    await context.close();
  });
});
