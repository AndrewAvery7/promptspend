import { createHash } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { GOOGLE_ANALYTICS_ENABLED } from '../../src/lib/analytics/config';
import { PAGE_TYPES } from '../../src/lib/analytics/page-type';

/**
 * The analytics test pack: what leaves the browser, held host by host.
 *
 * Like `analytics.spec.ts`, these tests visit `http://promptspend.com` (the
 * only host Google Analytics starts on) and have the browser fetch every page
 * from the local build. Unlike it, they intercept EVERY request the page makes,
 * to any host, and record it before answering: the site's own files from the
 * local build, `gtag.js` with a one-line stand-in, the alerts service's
 * `/v1/config` with a fixed answer (so the sign-up form draws even with no
 * network), and anything else refused. Nothing reaches the internet, so the
 * tests pass the same with or without Google being reachable.
 *
 * What is asserted, precisely:
 *
 * (a) Canary. A unique string is typed into every text field on the main
 *     pages (the calculator's model search and its paste boxes, the Compare
 *     table's search, the Learn view's token lab, the alert sign-up form's
 *     email field and model filter, the command palette, the Receipt page's
 *     fields, the token counter). After that, the canary (any letter case, also
 *     percent-decoded) appears in no recorded request's address, header or body,
 *     to any host; in no command queued for Google (`dataLayer`), which is
 *     everything PromptSpend's code tells `gtag.js`; and not in the page's own
 *     address, which Google's automatic page views would read. The email field
 *     gets an address built from the canary, so its plain text is covered by
 *     the same check. A SHA-256 hash of that address (what Google's
 *     user-provided-data feature sends) does not contain the canary, so it
 *     would pass; the test also asserts that if that hash ever appears, it goes
 *     only to a Google host. The form is never submitted: submitting sends the
 *     address to PromptSpend's own alerts service, by design.
 * (b) Every event PromptSpend's code queues is `page_view` or one of the three
 *     key events (store_click, install_copy, model_added), each with only its
 *     fixed parameter. (A guard also reads any measurement hit that reaches
 *     a Google collection host; it is empty while `gtag.js` is a stand-in,
 *     and only bites if a real one is ever loaded here.)
 * (c) A tagged address keeps its utm_* tags in the page view, while the
 *     alerts link's private key appears in no request and no queued command.
 *
 * Limit: the real `gtag.js` never runs here (it is Google's code, and loading
 * it would contact Google). What it is told is asserted; what it would then do
 * with the page on its own (automatic events, its own reading of the email
 * field to hash it) is not, and rests on Google's documentation.
 */

const LIVE = 'http://promptspend.com';
const GTAG_PREFIX = 'https://www.googletagmanager.com/gtag/js';
const GOOGLE_HOST =
  /^https:\/\/([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|google\.[a-z.]+|googlesyndication\.com)\//;

const CANARY = 'cnry7q3x9zkPS';
const CANARY_EMAIL = `${CANARY.toLowerCase()}@example.com`;
const EMAIL_SHA256 = createHash('sha256').update(CANARY_EMAIL.trim().toLowerCase()).digest('hex');

/** Events PromptSpend's own code may queue. */
const OWN_EVENTS = new Set(['page_view', 'store_click', 'install_copy', 'model_added']);
/** Google Analytics' own automatic events (enhanced measurement and session events). */
const GOOGLE_AUTOMATIC_EVENTS = new Set([
  'page_view',
  'user_engagement',
  'session_start',
  'first_visit',
  'scroll',
  'click',
  'form_start',
  'form_submit',
  'view_search_results',
  'file_download',
  'video_start',
  'video_progress',
  'video_complete',
]);

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** Serve promptspend.com from the local build, stand in for every other host, and record it all. */
async function onLiveHost(page: Page, baseURL: string): Promise<Recorded[]> {
  const recorded: Recorded[] = [];
  const record = async (request: Request) => {
    recorded.push({
      url: request.url(),
      method: request.method(),
      headers: await request.allHeaders(),
      body: request.postDataBuffer()?.toString('utf8') ?? '',
    });
  };
  const local = baseURL.replace(/\/$/, '');
  // Registered first, so it runs last: anything no route below claims.
  await page.route('**/*', async (route) => {
    const request = route.request();
    await record(request);
    const url = new URL(request.url());
    if (url.pathname.endsWith('/v1/config')) {
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({
          pushEnabled: false,
          emailEnabled: true,
          vapidPublicKey: null,
          turnstileSiteKey: null,
          turnstileRequired: false,
        }),
      });
    }
    if (request.url().startsWith(GTAG_PREFIX)) {
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: 'window.__gtagStandIn = true;',
      });
    }
    return route.abort();
  });
  await page.route(`${LIVE}/**`, async (route) => {
    await record(route.request());
    const response = await route.fetch({ url: route.request().url().replace(LIVE, local) });
    await route.fulfill({ response });
  });
  return recorded;
}

/** The queued gtag commands, as plain arrays. */
function queued(page: Page): Promise<unknown[][]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) =>
      Array.from(entry),
    ),
  );
}

const FIELDS =
  'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], textarea, [contenteditable="true"]';

/** Type the canary into every visible, editable text field; returns a label for each one filled. */
async function fillEveryField(page: Page): Promise<string[]> {
  const filled: string[] = [];
  const fields = page.locator(FIELDS);
  const count = await fields.count();
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible()) || !(await field.isEditable())) continue;
    const label =
      (await field.getAttribute('aria-label')) ??
      (await field.getAttribute('id')) ??
      (await field.getAttribute('placeholder')) ??
      `field ${i}`;
    const email = (await field.getAttribute('type')) === 'email';
    await field.fill(email ? CANARY_EMAIL : `${CANARY} private prompt`);
    filled.push(label);
  }
  return filled;
}

/** Everything a request carried, decoded, as one lowercase string. */
function carried(request: Recorded): string {
  const raw = [request.url, ...Object.values(request.headers), request.body].join('\n');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    /* keep the raw form */
  }
  return `${raw}\n${decoded}`.toLowerCase();
}

/** Every measurement hit to a Google collection host, as the event names it carries. */
function hitEvents(recorded: Recorded[]): string[] {
  const names: string[] = [];
  for (const request of recorded) {
    if (!GOOGLE_HOST.test(request.url) || !/\/collect\b/.test(request.url)) continue;
    for (const line of [request.url, ...request.body.split('\n')]) {
      const en = /[?&]en=([^&]+)/.exec(line.startsWith('http') ? line : `?${line}`)?.[1];
      if (en) names.push(decodeURIComponent(en));
    }
  }
  return names;
}

// Whatever is still in flight when a test ends (the store QR codes load late)
// is dropped rather than left to throw outside any test.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.use({ serviceWorkers: 'block' });

test.describe('analytics test pack, on promptspend.com', () => {
  test.skip(!GOOGLE_ANALYTICS_ENABLED, 'Google Analytics is paused');

  test('(a) a canary typed into every visible text field reaches no host and is never queued for Google', async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const recorded = await onLiveHost(page, baseURL!);
    const filled: string[] = [];
    // What each page queued for Google, and its own address, once the typing
    // has settled (the calculator writes its scenario into the address).
    const seen: string[] = [];
    const fillAndNote = async () => {
      filled.push(...(await fillEveryField(page)));
      await page.waitForTimeout(800);
      seen.push(JSON.stringify(await queued(page)), page.url());
    };

    // The calculator: model search, then every field switched to "Paste text".
    await page.goto(`${LIVE}/`);
    await expect.poll(async () => (await queued(page)).length).toBeGreaterThan(0);
    await page.getByLabel('Search models').waitFor();
    const pasteButtons = page.getByRole('button', { name: 'Paste text' });
    for (let i = 0; i < (await pasteButtons.count()); i += 1) {
      if (await pasteButtons.nth(i).isVisible()) await pasteButtons.nth(i).click();
    }
    await fillAndNote();

    // The other views of the calculator.
    for (const view of ['compare', 'learn', 'data']) {
      await page.goto(`${LIVE}/#${view}`);
      await page.waitForLoadState('networkidle');
      // The alert form's model filter shows once "only models I follow" is chosen.
      const followed = page.getByRole('radio', { name: /models I (choose|follow)|Only/i });
      if (view === 'data' && (await followed.count()) > 0) await followed.first().check();
      await fillAndNote();
    }

    // The command palette.
    await page.keyboard.press('Control+k');
    await fillAndNote();
    await page.keyboard.press('Escape');

    // The Receipt page (its editable fields sit in a closed <details>) and the token counter.
    await page.goto(`${LIVE}/receipt/`);
    await page.waitForLoadState('networkidle');
    for (const summary of await page.locator('details:not([open]) > summary').all()) {
      if (await summary.isVisible()) await summary.click();
    }
    await fillAndNote();
    await page.goto(`${LIVE}/token-counter/`);
    await page.waitForLoadState('networkidle');
    await fillAndNote();

    // A generated page's header search.
    await page.goto(`${LIVE}/models/claude-opus-5/`);
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Control+k');
    await fillAndNote();

    // Leave, so anything sent on the way out (beacons, the next page's referrer) is recorded too.
    await page.goto(`${LIVE}/privacy/`);
    await page.waitForLoadState('networkidle');

    // The pack actually typed into the fields it is about, not into nothing.
    for (const expected of [
      'Search models',
      'Search the table by model or provider',
      'token-lab-input',
      'tc-text',
    ]) {
      expect(filled, `never typed into ${expected}`).toContain(expected);
    }
    expect(filled.filter((label) => label.startsWith('field-')).length).toBeGreaterThan(0);
    // The sign-up form exists only in a build with an alerts service (CI's
    // has one); when it does, the pack must have typed into its email field.
    const hasAlertsService = recorded.some((r) => new URL(r.url).pathname.endsWith('/v1/config'));
    if (hasAlertsService) expect(filled).toContain('alerts-email');
    test.info().annotations.push({
      type: 'alerts form',
      description: hasAlertsService ? 'email field typed into' : 'this build has no alerts service',
    });
    expect(filled.length).toBeGreaterThanOrEqual(6);
    test.info().annotations.push({ type: 'typed into', description: filled.join(', ') });

    const canary = CANARY.toLowerCase();
    expect(recorded.length).toBeGreaterThan(0);
    for (const request of recorded) {
      expect(carried(request), `${request.method} ${request.url} carried the canary`).not.toContain(canary);
      if (carried(request).includes(EMAIL_SHA256)) {
        expect(request.url, 'the hashed email went somewhere other than Google').toMatch(GOOGLE_HOST);
      }
    }
    seen.push(JSON.stringify(await queued(page)), page.url());
    for (const note of seen)
      expect(note.toLowerCase(), 'queued for Google, or in the address').not.toContain(canary);
  });

  test('(b) every event the site queues is on the approved list, with only its fixed parameter', async ({
    page,
    baseURL,
  }) => {
    const recorded = await onLiveHost(page, baseURL!);
    await page.goto(`${LIVE}/`);
    await expect.poll(async () => (await queued(page)).length).toBeGreaterThan(0);

    // model_added: the default scenario already has the most models allowed,
    // so untick one, then tick a model that is not yet chosen. (Ticking
    // re-sorts the list, so the boxes are clicked, not `check`ed.)
    await page.locator('.model-row input[type="checkbox"]:checked').first().click();
    await page.locator('.model-row input[type="checkbox"]:not(:checked)').first().click();
    await expect
      .poll(async () => (await queued(page)).some((c) => c[0] === 'event' && c[1] === 'model_added'))
      .toBe(true);
    // install_copy: a Copy button on the Data view.
    // (Through the menu: a fresh load would start a new page and its own queue.)
    await page.getByRole('button', { name: 'Data & Alerts' }).click();
    await page.locator('[data-ga-install]').first().click();
    // store_click: an App Store link, kept from leaving the page.
    await page.evaluate(() =>
      document.addEventListener('click', (event) => {
        if ((event.target as Element).closest('a[href^="https://apps.apple.com"]')) event.preventDefault();
      }),
    );
    await page.locator('a[href^="https://apps.apple.com"]').first().click();

    const events = (await queued(page)).filter((command) => command[0] === 'event');
    const names = events.map((command) => command[1] as string);
    for (const name of names) expect(OWN_EVENTS, `unapproved event ${name}`).toContain(name);
    for (const name of ['model_added', 'install_copy', 'store_click']) expect(names).toContain(name);
    const params: Record<string, string[]> = {
      page_view: ['page_location', 'page_referrer', 'page_title', 'page_type'],
      model_added: ['model_id'],
      install_copy: ['tool'],
      store_click: ['store'],
    };
    for (const [, name, fields] of events) {
      expect(Object.keys(fields as object).sort(), `${String(name)} parameters`).toEqual(
        params[name as string]!.sort(),
      );
    }
    for (const name of hitEvents(recorded)) {
      expect(GOOGLE_AUTOMATIC_EVENTS.has(name) || OWN_EVENTS.has(name), `unapproved hit ${name}`).toBe(true);
    }
  });

  test('(c) a tagged address passes its utm_* tags through, and the alerts key reaches nothing', async ({
    page,
    baseURL,
  }) => {
    const recorded = await onLiveHost(page, baseURL!);
    const key = 'ALERTSKEYcnry5521';
    const tags = 'utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=llm&utm_content=hero';
    for (const path of ['/', '/models/claude-opus-5/']) {
      await page.goto(`${LIVE}${path}?${tags}&alerts=${key}`);
      await expect.poll(async () => (await queued(page)).length).toBeGreaterThan(0);
      await page.waitForLoadState('networkidle');
      const commands = await queued(page);
      const view = commands.find((c) => c[0] === 'event' && c[1] === 'page_view')![2] as {
        page_location: string;
      };
      expect(view.page_location).toBe(`${LIVE}${path}?${tags}`);
      expect(JSON.stringify(commands)).not.toContain(key);
      expect(JSON.stringify(commands)).not.toContain('alerts=');
    }
    // Two of PromptSpend's own hosts are meant to see the key: promptspend.com
    // itself (the page request carries the address as typed), and the alerts
    // service, which the key is for (`/v1/preferences?t=`, in builds that have
    // one). No other host may see it.
    const alertsOrigins = new Set(
      recorded
        .filter((r) => new URL(r.url).pathname.endsWith('/v1/config'))
        .map((r) => new URL(r.url).origin),
    );
    const elsewhere = recorded.filter(
      (request) => !request.url.startsWith(`${LIVE}/`) && !alertsOrigins.has(new URL(request.url).origin),
    );
    expect(elsewhere.some((request) => request.url.startsWith(GTAG_PREFIX))).toBe(true);
    for (const request of elsewhere) {
      expect(carried(request), `${request.url} carried the alerts key`).not.toContain(key.toLowerCase());
      expect(carried(request)).not.toContain('alerts=');
    }
  });

  test('one page of each main kind tells Google its type, in the page view and the configuration', async ({
    page,
    baseURL,
  }) => {
    await onLiveHost(page, baseURL!);
    const expected: [string, string][] = [
      ['/', 'home'],
      ['/receipt/', 'receipt'],
      ['/models/claude-opus-5/', 'model'],
      ['/providers/', 'hub'],
      ['/free-tiers/', 'hub'],
      ['/token-counter/', 'token-counter'],
      ['/privacy/', 'privacy'],
      ['/404.html', 'not-found'],
    ];
    for (const [path, type] of expected) {
      expect(PAGE_TYPES).toContain(type);
      await page.goto(`${LIVE}${path}`);
      await expect.poll(async () => (await queued(page)).length).toBeGreaterThan(0);
      const commands = await queued(page);
      const view = commands.find((c) => c[0] === 'event' && c[1] === 'page_view')![2] as {
        page_type: string;
      };
      const config = commands.find((c) => c[0] === 'config')![2] as { page_type: string };
      expect([path, view.page_type, config.page_type]).toEqual([path, type, type]);
    }
  });
});
