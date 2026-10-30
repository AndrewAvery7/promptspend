import { describe, expect, it } from 'vitest';
import {
  AuditCannotRun,
  follow,
  readPageSpeed,
  runAudit,
  type AuditOptions,
  type Fetcher,
  type HttpResponse,
} from './crawl';
import { scoreAudit } from './score';

const HTML = 'text/html; charset=utf-8';

function html(title: string, body: string, head = ''): string {
  return `<html><head><title>${title}</title>${head}</head><body><main>${body}</main></body></html>`;
}

/** A small fake site. Every request is recorded, so the tests can prove what was and was not read. */
function fakeSite(overrides: Record<string, Partial<HttpResponse> | Error> = {}): {
  fetch: Fetcher;
  requests: string[];
} {
  const routes: Record<string, Partial<HttpResponse> | Error> = {
    'https://example.com/robots.txt': {
      body: 'User-agent: *\nDisallow: /secret/\nSitemap: https://example.com/sitemap-index.xml\n',
      contentType: 'text/plain',
    },
    'https://example.com/sitemap-index.xml': {
      body: '<sitemapindex><sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap></sitemapindex>',
      contentType: 'application/xml',
    },
    'https://example.com/sitemap-pages.xml': {
      body: '<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about/</loc></url><url><loc>https://example.com/old/</loc></url></urlset>',
      contentType: 'application/xml',
    },
    'https://example.com/': {
      body: html(
        'Home',
        '<a href="/about/">About</a> <a href="/secret/">Secret</a> <a href="/old/">Old</a> <a href="/privacy/">Privacy policy</a> <a href="https://other.org/x">Other</a> <a href="/report.pdf">PDF</a>',
        '<script type="application/ld+json">{"@type":"Organization"}</script><script>gtag("config","G-TEST1234")</script><script src="https://www.googletagmanager.com/gtag/js?id=G-TEST1234"></script>',
      ),
    },
    'https://example.com/about/': {
      body: html('About', '<a href="/">Home</a> <a href="/missing/">Missing</a>'),
    },
    'https://example.com/old/': { status: 301, location: '/about/' },
    'https://example.com/privacy/': { body: html('Privacy', 'We use Google Analytics.') },
    'https://example.com/report.pdf': { contentType: 'application/pdf' },
    'https://example.com/missing/': { status: 404 },
    'https://other.org/robots.txt': { status: 404 },
    'https://other.org/x': { status: 405 },
    ...overrides,
  };
  const requests: string[] = [];
  const fetch: Fetcher = async (url, method) => {
    requests.push(`${method} ${url}`);
    const route = routes[url];
    if (route instanceof Error) throw route;
    if (!route) return { status: 404, location: null, contentType: 'text/html', body: '' };
    return {
      status: route.status ?? 200,
      location: route.location ?? null,
      contentType: route.contentType ?? HTML,
      body: method === 'GET' ? (route.body ?? '') : '',
    };
  };
  return { fetch, requests };
}

const OPTIONS: AuditOptions = {
  site: 'https://example.com/',
  userAgent: 'TestAudit/1.0',
  robotsToken: 'TestAudit',
  maxPages: 50,
  sitemapSample: 10,
  maxLinkChecks: 50,
  skipBrokenLinks: false,
  mobile: false,
};

const FIXED = (): Date => new Date('2026-10-30T12:00:00Z');

describe('the crawl', () => {
  it('reads robots.txt first and never requests a disallowed page', async () => {
    const site = fakeSite();
    const evidence = await runAudit(OPTIONS, { fetch: site.fetch, now: FIXED });
    expect(site.requests[0]).toBe('GET https://example.com/robots.txt');
    expect(site.requests.some((r) => r.includes('/secret/'))).toBe(false);
    expect(evidence.crawl.skippedByRobots).toEqual(['https://example.com/secret/']);
    expect(site.requests.every((r) => r.startsWith('GET ') || r.startsWith('HEAD '))).toBe(true);
  });

  it('follows the sitemap index, samples addresses and counts redirects', async () => {
    const evidence = await runAudit(OPTIONS, { fetch: fakeSite().fetch, now: FIXED });
    expect(evidence.sitemaps.files.map((f) => f.kind)).toEqual(['index', 'urlset']);
    expect(evidence.sitemaps.urlCount).toBe(3);
    expect(evidence.sitemaps.sampled.find((s) => s.url.endsWith('/old/'))).toMatchObject({
      status: 200,
      hops: 1,
    });
  });

  it('crawls breadth first, records depth and every page it read', async () => {
    const evidence = await runAudit(OPTIONS, { fetch: fakeSite().fetch, now: FIXED });
    const byUrl = Object.fromEntries(evidence.crawl.pages.map((p) => [p.url, p]));
    expect(evidence.crawl.complete).toBe(true);
    expect(byUrl['https://example.com/about/']).toMatchObject({ depth: 1, isHtml: true, title: 'About' });
    expect(byUrl['https://example.com/old/']).toMatchObject({
      hops: 1,
      finalUrl: 'https://example.com/about/',
    });
    expect(byUrl['https://example.com/report.pdf']!.isHtml).toBe(false);
    expect(byUrl['https://example.com/missing/']).toMatchObject({ status: 404, depth: 2 });
    expect(byUrl['https://example.com/']!.outboundLinks).toEqual(['https://other.org/x']);
  });

  it('checks outbound links once, after reading that site’s robots.txt, falling back from HEAD to GET', async () => {
    const site = fakeSite();
    const evidence = await runAudit(OPTIONS, { fetch: site.fetch, now: FIXED });
    expect(site.requests).toContain('GET https://other.org/robots.txt');
    expect(site.requests.filter((r) => r.endsWith('https://other.org/x'))).toEqual([
      'HEAD https://other.org/x',
      'GET https://other.org/x',
    ]);
    const outbound = evidence.links.checked.find((l) => !l.internal)!;
    expect(outbound.status).toBe(405);
    expect(evidence.privacy).toMatchObject({
      url: 'https://example.com/privacy/',
      status: 200,
      mentions: ['Google Analytics'],
    });
  });

  it('stops at the page cap and says the crawl is incomplete', async () => {
    const evidence = await runAudit(
      { ...OPTIONS, maxPages: 2, maxLinkChecks: 1 },
      { fetch: fakeSite().fetch, now: FIXED },
    );
    expect(evidence.crawl.pages).toHaveLength(2);
    expect(evidence.crawl.complete).toBe(false);
    expect(evidence.links.leftUnchecked).toBeGreaterThan(0);
  });

  it('skips link checks and speed when asked or when there is no key', async () => {
    const site = fakeSite();
    const evidence = await runAudit({ ...OPTIONS, skipBrokenLinks: true }, { fetch: site.fetch, now: FIXED });
    expect(evidence.links.notChecked).toMatch(/skipped/);
    expect(evidence.speed.notChecked).toBe('no PAGESPEED_API_KEY set');
    expect(site.requests.some((r) => r.includes('other.org'))).toBe(false);
  });

  it('runs PageSpeed for the home page and top pages when a client is given, and saves the raw JSON', async () => {
    const saved: string[] = [];
    const calls: string[] = [];
    const evidence = await runAudit(
      { ...OPTIONS, mobile: true },
      {
        fetch: fakeSite().fetch,
        now: FIXED,
        saveRaw: async (name) => void saved.push(name),
        pagespeed: async (url, strategy) => {
          calls.push(`${strategy} ${url}`);
          if (url.endsWith('/about/') && strategy === 'mobile') throw new Error('quota');
          return { lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 1800 } } } };
        },
      },
    );
    expect(calls).toContain('desktop https://example.com/');
    expect(calls).toContain('mobile https://example.com/');
    expect(evidence.speed.results.find((r) => r.error === 'quota')).toBeDefined();
    expect(saved).toContain('robots.txt');
    expect(saved.some((name) => name.startsWith('pagespeed-'))).toBe(true);
    expect(scoreAudit(evidence).areas.find((a) => a.number === 10)!.status).toBe('scored');
  });

  it('refuses to run when robots.txt is unreadable, the home page is blocked, or the site is down', async () => {
    await expect(
      runAudit(OPTIONS, { fetch: fakeSite({ 'https://example.com/robots.txt': { status: 503 } }).fetch }),
    ).rejects.toThrow(AuditCannotRun);
    await expect(
      runAudit(OPTIONS, {
        fetch: fakeSite({
          'https://example.com/robots.txt': {
            body: 'User-agent: *\nDisallow: /\n',
            contentType: 'text/plain',
          },
        }).fetch,
      }),
    ).rejects.toThrow(/asks crawlers like this one not to read/);
    await expect(
      runAudit(OPTIONS, { fetch: fakeSite({ 'https://example.com/': new Error('ECONNREFUSED') }).fetch }),
    ).rejects.toThrow(/ECONNREFUSED/);
    await expect(runAudit({ ...OPTIONS, site: 'not a url' }, { fetch: fakeSite().fetch })).rejects.toThrow(
      /not a web address/,
    );
    await expect(
      runAudit({ ...OPTIONS, site: 'ftp://example.com/' }, { fetch: fakeSite().fetch }),
    ).rejects.toThrow(/not an http/);
  });

  it('treats a missing robots.txt as allowing everything and falls back to /sitemap.xml', async () => {
    const site = fakeSite({ 'https://example.com/robots.txt': { status: 404 } });
    const evidence = await runAudit(OPTIONS, { fetch: site.fetch, now: FIXED });
    expect(evidence.robots.status).toBe(404);
    expect(site.requests).toContain('GET https://example.com/sitemap.xml');
    expect(evidence.sitemaps.files).toEqual([
      { url: 'https://example.com/sitemap.xml', status: 404, kind: 'invalid' },
    ]);
  });
});

describe('redirects and PageSpeed answers', () => {
  it('gives up after five hops', async () => {
    const loop: Fetcher = async (url) => ({ status: 302, location: `${url}x`, contentType: '', body: '' });
    const result = await follow(loop, 'https://a.com/', 'GET');
    expect(result).toMatchObject({ status: 0, error: 'too many redirects' });
  });

  it('prefers field data for the page, then for the site, then the lab', () => {
    const field = readPageSpeed(
      {
        loadingExperience: {
          metrics: {
            LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1300 },
            INTERACTION_TO_NEXT_PAINT: { percentile: 90 },
            CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 },
          },
        },
      },
      'https://a.com/',
      'mobile',
      'now',
    );
    expect(field).toMatchObject({
      source: 'field',
      lcpMs: 1300,
      interactionMs: 90,
      interactionMetric: 'INP',
      cls: 0.05,
    });
    const origin = readPageSpeed(
      { originLoadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000 } } } },
      'u',
      'desktop',
      'now',
    );
    expect(origin).toMatchObject({ source: 'origin', cls: null, interactionMs: null });
    const lab = readPageSpeed(
      {
        lighthouseResult: {
          audits: {
            'largest-contentful-paint': { numericValue: 2100 },
            'total-blocking-time': { numericValue: 50 },
            'cumulative-layout-shift': { numericValue: 0.01 },
          },
        },
      },
      'u',
      'desktop',
      'now',
    );
    expect(lab).toMatchObject({
      source: 'lab',
      lcpMs: 2100,
      interactionMs: 50,
      interactionMetric: 'TBT',
      cls: 0.01,
    });
    expect(readPageSpeed({}, 'u', 'desktop', 'now').error).toMatch(/no PageSpeed data/);
  });
});
