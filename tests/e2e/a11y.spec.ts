import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility, audited by axe on every commit.
 *
 * This is the half of the pre-publication audit finding that the layout suite
 * did not close. `src/lib/contrast.test.ts` already checks every accent against
 * every surface, so the gap axe fills is the structural half: landmarks, roles,
 * accessible names, heading order, and controls that a mouse can operate and a
 * screen reader cannot describe.
 *
 * It runs against the built site at every viewport in `playwright.config.ts`,
 * because some of these faults only appear at one width — a nav that collapses
 * into a menu button on a phone is a different tree from the one on a desktop,
 * and only the phone version can have an unlabeled toggle.
 */

/** WCAG 2.1 A and AA. The level the rest of the project already claims. */
const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The app's four views, reached through the nav rather than by URL. */
const VIEWS = ['Estimate', 'Compare', 'Learn', 'Data & Alerts'] as const;

/** Generated pages — the majority of what a visitor actually lands on. */
const GENERATED = [
  { path: '/receipt/', name: 'the Receipt page' },
  { path: '/models/', name: 'model index' },
  { path: '/models/claude-opus-5/', name: 'a model page' },
  { path: '/models/claude-sonnet-5/', name: 'a model page with a price-history chart' },
  { path: '/providers/anthropic/', name: 'a provider page' },
  { path: '/compare/claude-opus-5-vs-gpt-5-5/', name: 'a comparison page' },
  { path: '/app/', name: 'the apps page' },
  { path: '/free-tiers/', name: 'the free-tier comparison' },
  { path: '/changes/', name: 'the price changes page' },
  { path: '/token-counter/', name: 'the token counter' },
  { path: '/providers/cohere/free/', name: 'a free-tier page' },
  // Every other kind of page, added in the 2026-10-30 sweep (one of each).
  { path: '/writing/what-llm-cost-calculators-get-wrong/', name: 'an article' },
  { path: '/writing/', name: 'the writing index' },
  { path: '/data/', name: 'the open-data page' },
  { path: '/about/', name: 'the about page' },
  { path: '/corrections/', name: 'the corrections page' },
  { path: '/topics/', name: 'the topics page' },
  { path: '/privacy/', name: 'the privacy page' },
  // `vite preview` answers an unknown address with the calculator, so the
  // not-found page is asked for by its file name.
  { path: '/404.html', name: 'the not-found page' },
] as const;

/**
 * Report violations as something you can act on.
 *
 * axe's own output is deeply nested and prints as `[Object]` in a terminal,
 * which is how an accessibility suite ends up being ignored. Each line names
 * the rule, the impact, the offending selector and the fix axe suggests.
 */
function report(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 4)
        .map((n) => `      ${n.target.join(' ')}\n        ${n.failureSummary?.split('\n').join(' ')}`)
        .join('\n');
      const more = v.nodes.length > 4 ? `\n      …and ${v.nodes.length - 4} more` : '';
      return `  ${v.id} (${v.impact}) — ${v.help}\n${nodes}${more}`;
    })
    .join('\n');
}

async function audit(page: import('@playwright/test').Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  expect(violations.length, `\n${report(violations)}\n`).toBe(0);
}

test.describe('the app', () => {
  for (const view of VIEWS) {
    test(`${view} has no accessibility violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: view, exact: true }).click();
      await expect(page.locator('main')).toBeVisible();
      // The catalog arrives over the network and most of the page is rendered
      // from it. Auditing before it lands would audit an empty shell and pass.
      await page.waitForLoadState('networkidle');
      await audit(page);
    });
  }
});

test.describe('the generated pages', () => {
  for (const { path, name } of GENERATED) {
    test(`${name} has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await audit(page);
    });
  }
});

/**
 * The same audit in the dark theme, which is a different set of colors on every
 * page and was never audited: the 2026-10-30 sweep found the ticker's amber,
 * green and dimmed text all under 4.5:1 there, on every page, because the bar
 * is `--ink` and turns light. With no choice saved, the theme follows the
 * operating system, so asking for a dark color scheme is how a dark-mode
 * visitor arrives.
 */
test.describe('in the dark theme', () => {
  test.use({ colorScheme: 'dark' });

  for (const view of VIEWS) {
    test(`${view} has no accessibility violations`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: view, exact: true }).click();
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await audit(page);
    });
  }

  for (const { path, name } of GENERATED) {
    test(`${name} has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('main')).toBeVisible();
      await audit(page);
    });
  }
});
