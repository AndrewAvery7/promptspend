import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { GOOGLE_ANALYTICS_ENABLED } from '../../src/lib/analytics/config';

/**
 * Google Analytics on the website, checked in a real browser.
 *
 * It runs only on promptspend.com, so these tests visit `http://promptspend.com`
 * and have the browser fetch every page from the local build instead: the page
 * believes it is on the real host, which is what makes it start. Google is
 * never contacted. `gtag.js` is answered with a one-line stand-in, and any
 * report to a Google Analytics host is recorded and refused, so a test run
 * cannot send a single hit to the real account.
 *
 * What is held here: gtag.js loads with the right ID on all three kinds of page
 * and the Content Security Policy lets it; the notice shows, links to the
 * privacy page, and dismisses for good; "Turn off" and the privacy page's
 * control stop it; the address Google is told keeps everything but the alert
 * links' private key; text pasted never reaches it; and none of this happens anywhere but
 * promptspend.com. What the real `gtag.js` then sends is Google's code; it is
 * told only what `src/lib/analytics/ga.ts` queues, which is what is asserted.
 */

const LIVE = 'http://promptspend.com';
const GTAG = 'https://www.googletagmanager.com/gtag/js?id=G-P27XJ53BH9';
const GOOGLE =
  /^https:\/\/([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|www\.google\.com)\//;

interface Recorder {
  google: Request[];
  violations: () => Promise<string[]>;
}

/** Serve promptspend.com from the local build, and stand in for Google. */
async function onLiveHost(page: Page, baseURL: string): Promise<Recorder> {
  const google: Request[] = [];
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const local = baseURL.replace(/\/$/, '');
  await page.route(`${LIVE}/**`, async (route) => {
    const response = await route.fetch({ url: route.request().url().replace(LIVE, local) });
    await route.fulfill({ response });
  });
  await page.route(GOOGLE, (route) => {
    google.push(route.request());
    if (route.request().url().startsWith('https://www.googletagmanager.com/gtag/js')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: 'window.__gtagStandIn = true;',
      });
    }
    return route.abort();
  });
  return {
    google,
    violations: () =>
      page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
  };
}

/** The queued gtag commands, as plain arrays. */
function queued(page: Page): Promise<unknown[][]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) =>
      Array.from(entry),
    ),
  );
}

const notice = (page: Page) => page.getByRole('region', { name: 'Analytics notice' });

// A test can finish while the page is still fetching through the stand-in
// routes above (the app's store QR codes load after the page does). Unroute
// before the page closes, and drop whatever is still in flight: otherwise that
// late fetch throws "Test ended" outside any test, and Playwright fails the
// whole run over it even though every assertion passed.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// Google Analytics can be paused (`GOOGLE_ANALYTICS_ENABLED` in
// src/lib/analytics/config.ts; it was, for part of 2026-10-29). While it is, the
// running-state tests below are skipped and the paused-state tests run instead;
// flip the switch and they swap places.
test.describe('while Google Analytics is paused', () => {
  test.skip(GOOGLE_ANALYTICS_ENABLED, 'Google Analytics is running');

  for (const path of ['/', '/models/claude-opus-5/', '/receipt/', '/privacy/']) {
    test(`${path} loads nothing from Google, shows no notice, and its policy names no Google host`, async ({
      page,
      baseURL,
      context,
    }) => {
      const recorder = await onLiveHost(page, baseURL!);
      await page.goto(`${LIVE}${path}`);
      await page.waitForLoadState('networkidle');
      await expect(notice(page)).toHaveCount(0);
      expect(recorder.google).toEqual([]);
      expect(await recorder.violations()).toEqual([]);
      expect(await context.cookies()).toEqual([]);
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      expect(policy).not.toMatch(/googletagmanager|google-analytics|analytics\.google/);
      await expect(page.locator('#analytics-choice')).toHaveCount(0);
    });
  }

  test('clears a Google Analytics cookie an earlier visit left behind', async ({
    page,
    baseURL,
    context,
  }) => {
    await onLiveHost(page, baseURL!);
    await context.addCookies([{ name: '_ga', value: 'GA1.1.1.1', url: LIVE }]);
    await page.goto(`${LIVE}/`);
    await page.waitForLoadState('networkidle');
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain('_ga');
  });
});

test.describe('on promptspend.com', () => {
  test.skip(!GOOGLE_ANALYTICS_ENABLED, 'Google Analytics is paused');

  for (const path of ['/', '/models/claude-opus-5/', '/receipt/']) {
    test(`${path} loads gtag.js with the right ID, allowed by its policy, and shows the notice`, async ({
      page,
      baseURL,
    }) => {
      const recorder = await onLiveHost(page, baseURL!);
      await page.goto(`${LIVE}${path}`);
      await expect(notice(page)).toBeVisible();
      await expect.poll(() => recorder.google.map((request) => request.url())).toEqual([GTAG]);
      expect(
        await page.evaluate(() => (window as unknown as { __gtagStandIn?: boolean }).__gtagStandIn),
      ).toBe(true);
      expect(await recorder.violations()).toEqual([]);

      await expect(notice(page)).toContainText('uses Google Analytics cookies');
      await expect(notice(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
        'href',
        '/privacy/',
      );
      const results = await new AxeBuilder({ page })
        .include('.ga-notice')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('tells Google the whole address except the private key, and sends one page view', async ({
    page,
    baseURL,
  }) => {
    await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/?alerts=TEST-TOKEN-NOT-REAL&in=4321&utm_source=test#data`);
    await expect(notice(page)).toBeVisible();
    const commands = await queued(page);
    const pageViews = commands.filter((c) => c[0] === 'event' && c[1] === 'page_view');
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0]![2]).toMatchObject({
      page_location: `${LIVE}/?in=4321&utm_source=test#data`,
      page_referrer: '',
    });
    const config = commands.find((c) => c[0] === 'config');
    expect(config?.[1]).toBe('G-P27XJ53BH9');
    expect(config?.[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: true,
      allow_ad_personalization_signals: true,
    });
    expect(JSON.stringify(commands)).not.toContain('TEST-TOKEN-NOT-REAL');
    // ...and the alerts panel has taken the key out of the address itself, so
    // Google's own later page views cannot read it either.
    await expect.poll(() => page.url()).not.toContain('TEST-TOKEN-NOT-REAL');
  });

  test('never hands Google text that was pasted', async ({ page, baseURL }) => {
    const recorder = await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/`);
    await notice(page).getByRole('button', { name: 'OK' }).click();
    const secret = 'PRIVATE PROMPT TEXT 7f3a';
    await page.getByRole('button', { name: 'Paste text' }).first().click();
    await page.locator('textarea:visible').first().fill(secret);
    // The page now writes the changed scenario into its own address.
    await expect.poll(() => new URL(page.url()).search).not.toBe('');
    const everything = JSON.stringify(await queued(page));
    expect(everything).not.toContain(secret);
    for (const request of recorder.google) {
      expect(request.url()).not.toContain('7f3a');
      expect(request.postData() ?? '').not.toContain('7f3a');
    }
  });

  test('OK dismisses the notice for good, and Google Analytics keeps counting', async ({ page, baseURL }) => {
    const recorder = await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/`);
    await notice(page).getByRole('button', { name: 'OK' }).click();
    await expect(notice(page)).toHaveCount(0);
    await page.goto(`${LIVE}/models/claude-opus-5/`);
    await expect.poll(() => recorder.google.length).toBe(2);
    await expect(notice(page)).toHaveCount(0);
  });

  test('Turn off stops Google Analytics on every later page', async ({ page, baseURL }) => {
    const recorder = await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/`);
    await notice(page).getByRole('button', { name: 'Turn off' }).click();
    await expect(notice(page)).toHaveCount(0);
    const before = recorder.google.length;
    await page.goto(`${LIVE}/models/claude-opus-5/`);
    await page.waitForLoadState('networkidle');
    expect(recorder.google.length).toBe(before);
    await expect(notice(page)).toHaveCount(0);
  });

  test('the privacy page explains it and has a working on/off control', async ({ page, baseURL }) => {
    const recorder = await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/privacy/`);
    await expect(page.getByRole('heading', { name: 'Website visit statistics' })).toBeVisible();
    await expect(page.locator('#analytics-choice')).toContainText('Google Analytics is on in this browser.');
    await page.getByRole('button', { name: 'Turn off Google Analytics' }).click();
    await expect(page.locator('#analytics-choice')).toContainText('Google Analytics is off in this browser.');
    await expect(notice(page)).toHaveCount(0);
    const before = recorder.google.length;
    await page.goto(`${LIVE}/`);
    await page.waitForLoadState('networkidle');
    expect(recorder.google.length).toBe(before);
  });

  test('the notice fits a narrow phone without pushing the page sideways', async ({ page, baseURL }) => {
    await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/`);
    await expect(notice(page)).toBeVisible();
    const box = await notice(page).boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
});

test('anywhere but promptspend.com, nothing from Google loads and no notice shows', async ({ page }) => {
  const google: string[] = [];
  await page.route(GOOGLE, (route) => {
    google.push(route.request().url());
    return route.abort();
  });
  for (const path of ['/', '/models/claude-opus-5/', '/receipt/', '/privacy/']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(notice(page)).toHaveCount(0);
  }
  if (GOOGLE_ANALYTICS_ENABLED) {
    await expect(page.locator('#analytics-choice')).toContainText('runs only on promptspend.com');
  } else {
    await expect(page.locator('#analytics-choice')).toHaveCount(0);
  }
  expect(google).toEqual([]);
});
