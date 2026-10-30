import { describe, expect, it } from 'vitest';
import { findingsCsv, pagesCsv, renderMarkdown, reportJson, summaryLine, toCsv } from './report';
import { band, nearDuplicates, pointsForShare, pointsForSpeed, scoreAudit, type AreaScore } from './score';
import type { AuditEvidence, PageRecord, SpeedResult } from './types';

const AT = '2026-10-30T12:00:00.000Z';
const HOME = 'https://example.com/';

function words(n: number, seed: string): string {
  return Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');
}

function page(path: string, overrides: Partial<PageRecord> = {}): PageRecord {
  const url = new URL(path, HOME).href;
  return {
    url,
    status: 200,
    depth: path === '/' ? 0 : 1,
    hops: 0,
    finalUrl: url,
    isHtml: true,
    title: `A distinct and useful title for ${path}`,
    description: `A description of ${path} that is long enough to fall inside the recommended range.`,
    canonical: url,
    canonicalIsAbsolute: true,
    wordCount: 500,
    jsonLdTypes: path === '/' ? ['Organization'] : [],
    jsonLdErrors: 0,
    internalLinks: [],
    outboundLinks: [],
    tagIds: ['G-ABC1234'],
    analytics: ['Google Analytics'],
    cspAnalytics: [],
    privacyLinks: path === '/' ? ['https://example.com/privacy/'] : [],
    text: words(500, path),
    readAt: AT,
    ...overrides,
  };
}

/** A healthy small site: every area this tool scores should get 4. */
function healthy(): AuditEvidence {
  const paths = ['/', '/a/', '/b/', '/c/', '/privacy/'];
  const pages = paths.map((path) => page(path, { internalLinks: paths.map((p) => new URL(p, HOME).href) }));
  return {
    site: HOME,
    home: HOME,
    userAgent: 'test',
    startedAt: AT,
    finishedAt: AT,
    robots: {
      readAt: AT,
      status: 200,
      sitemaps: ['https://example.com/sitemap.xml'],
      homeBlocked: { all: false, googlebot: false, bingbot: false },
      sitemapsBlocked: [],
    },
    sitemaps: {
      readAt: AT,
      files: [{ url: 'https://example.com/sitemap.xml', status: 200, kind: 'urlset' }],
      urlCount: paths.length,
      sampled: paths.map((path) => ({ url: new URL(path, HOME).href, status: 200, hops: 0 })),
      urls: paths.map((path) => new URL(path, HOME).href),
    },
    crawl: { readAt: AT, pages, complete: true, maxPages: 50, skippedByRobots: [] },
    links: {
      readAt: AT,
      checked: pages.map((p) => ({ url: p.url, from: HOME, internal: true, status: 200, hops: 0 })),
      leftUnchecked: 0,
    },
    speed: {
      readAt: AT,
      results: [
        {
          url: HOME,
          strategy: 'desktop',
          source: 'field',
          lcpMs: 1300,
          interactionMs: 90,
          interactionMetric: 'INP',
          cls: 0.02,
          readAt: AT,
        },
      ],
    },
    privacy: { readAt: AT, url: 'https://example.com/privacy/', status: 200, mentions: ['Google Analytics'] },
  };
}

function area(card: ReturnType<typeof scoreAudit>, n: number): AreaScore {
  return card.areas.find((a) => a.number === n)!;
}

describe('the scorecard', () => {
  it('gives a healthy site full marks on all ten areas it can score, out of 76', () => {
    const card = scoreAudit(healthy());
    expect(card.scoredAreas).toBe(10);
    expect(card.possible).toBe(76);
    expect(card.points).toBe(76);
    expect(card.scaled).toBe(100);
    expect(card.band).toBe('healthy');
    expect(card.serious).toBe(0);
    for (const n of [3, 11, 12]) expect(area(card, n).status).toBe('owner-access');
  });

  it('never scores a check that did not run as a pass', () => {
    const evidence = healthy();
    evidence.speed = { readAt: AT, results: [], notChecked: 'no PAGESPEED_API_KEY set' };
    evidence.links = { readAt: AT, checked: [], leftUnchecked: 0, notChecked: 'skipped on request' };
    const card = scoreAudit(evidence);
    expect(area(card, 10)).toMatchObject({ status: 'not-checked', points: null, score: null });
    expect(area(card, 9).status).toBe('not-checked');
    expect(card.scoredAreas).toBe(8);
    expect(card.possible).toBe(76 - 2 * 4 - 1 * 4);
    expect(summaryLine(card, 'r.md')).toBe(
      'Scored 8 of 13 areas: 64 of 64 possible points. 0 serious issues. Report: r.md',
    );
  });

  it('scores a blocked home page 0 and a blocked sitemap 1 on search engine access', () => {
    const blocked = healthy();
    blocked.robots.homeBlocked.googlebot = true;
    expect(area(scoreAudit(blocked), 1).points).toBe(0);
    const sitemap = healthy();
    sitemap.robots.sitemapsBlocked = ['https://example.com/sitemap.xml'];
    expect(area(scoreAudit(sitemap), 1).points).toBe(1);
    const missing = healthy();
    missing.robots.status = 404;
    expect(area(scoreAudit(missing), 1).points).toBe(3);
    const noSitemapLine = healthy();
    noSitemapLine.robots.sitemaps = [];
    noSitemapLine.crawl.skippedByRobots = ['https://example.com/?m=x'];
    const result = area(scoreAudit(noSitemapLine), 1);
    expect(result.points).toBe(3);
    expect(result.evidence).toContain('1 linked address(es) disallowed');
  });

  it('scores sitemaps by what the sample answered', () => {
    const none = healthy();
    none.sitemaps.files = [];
    expect(area(scoreAudit(none), 2).points).toBe(0);
    const empty = healthy();
    empty.sitemaps.files = [{ url: 'https://example.com/sitemap.xml', status: 200, kind: 'invalid' }];
    expect(area(scoreAudit(empty), 2).points).toBe(1);
    const redirecting = healthy();
    redirecting.sitemaps.sampled[0]!.hops = 1;
    expect(area(scoreAudit(redirecting), 2).points).toBe(2); // 1 of 5 is 20%
    const many = healthy();
    many.sitemaps.sampled = Array.from({ length: 20 }, (_, i) => ({
      url: `${HOME}${i}`,
      status: i === 0 ? 404 : 200,
      hops: 0,
    }));
    const card = scoreAudit(many);
    expect(area(card, 2).points).toBe(3);
    expect(card.findings.find((f) => f.check === 'sitemap')!.severity).toBe('serious');
    const partlyBroken = healthy();
    partlyBroken.sitemaps.files.push({
      url: 'https://example.com/sitemap-2.xml',
      status: 404,
      kind: 'invalid',
    });
    expect(area(scoreAudit(partlyBroken), 2).points).toBe(2);
  });

  it('flags missing, relative and chained canonicals', () => {
    const evidence = healthy();
    const [, a, b, c] = evidence.crawl.pages;
    a!.canonical = null;
    b!.canonicalIsAbsolute = false;
    // c points at a, and a has no canonical: not a chain. Point it at d, which points elsewhere.
    c!.canonical = 'https://example.com/privacy/';
    evidence.crawl.pages[4]!.canonical = HOME;
    const card = scoreAudit(evidence);
    expect(card.findings.filter((f) => f.check === 'canonical').map((f) => f.detail)).toEqual([
      'No canonical',
      'Canonical is a relative address',
      'Canonical chain: points to https://example.com/privacy/, which points to https://example.com/',
    ]);
    expect(area(card, 4).points).toBe(1); // 3 of 5 pages
  });

  it('holds duplicate titles to the share rule and length alone to no lower than 2', () => {
    const duplicate = healthy();
    duplicate.crawl.pages[1]!.title = duplicate.crawl.pages[2]!.title;
    duplicate.crawl.pages[3]!.description = null;
    expect(area(scoreAudit(duplicate), 5).points).toBe(1); // 3 of 5 serious = 60%
    const short = healthy();
    short.crawl.pages.forEach((p, i) => {
      p.title = `Short title ${i}`;
      p.description = `Too short ${i}`;
    });
    const card = scoreAudit(short);
    expect(area(card, 5).points).toBe(2);
    expect(card.findings.filter((f) => f.check === 'titles').every((f) => f.severity === 'info')).toBe(true);
    const oneLong = healthy();
    oneLong.crawl.pages = [...oneLong.crawl.pages, ...['/d/', '/e/', '/f/'].map((path) => page(path))];
    oneLong.crawl.pages[1]!.description = `${'x'.repeat(170)}`;
    expect(area(scoreAudit(oneLong), 5).points).toBe(3);
  });

  it('scores structured data from the home page markup and parse errors', () => {
    const errors = healthy();
    errors.crawl.pages[2]!.jsonLdErrors = 1;
    expect(area(scoreAudit(errors), 6).points).toBe(2);
    const noOrg = healthy();
    noOrg.crawl.pages[0]!.jsonLdTypes = ['WebSite'];
    expect(area(scoreAudit(noOrg), 6).points).toBe(2);
    const brokenOnly = healthy();
    brokenOnly.crawl.pages[0]!.jsonLdTypes = [];
    brokenOnly.crawl.pages[0]!.jsonLdErrors = 2;
    expect(area(scoreAudit(brokenOnly), 6).points).toBe(1);
    const none = healthy();
    none.crawl.pages[0]!.jsonLdTypes = [];
    expect(area(scoreAudit(none), 6).points).toBe(0);
  });

  it('finds thin pages and near-duplicates whose only difference is a name', () => {
    const evidence = healthy();
    evidence.crawl.pages[1]!.wordCount = 120;
    const template = words(400, 'w');
    evidence.crawl.pages[2]!.text = `Acme ${template}`;
    evidence.crawl.pages[3]!.text = `Zenith ${template}`;
    const card = scoreAudit(evidence);
    expect(nearDuplicates(evidence.crawl.pages)).toHaveLength(1);
    expect(card.findings.filter((f) => f.check === 'content')).toHaveLength(2);
    expect(area(card, 7).points).toBe(1); // 2 of 5 flagged is 40%
    expect(area(card, 7).evidence).toContain('median 500 words');
  });

  it('checks orphans only when the whole site was crawled, and caps the area at 3 otherwise', () => {
    const orphan = healthy();
    orphan.sitemaps.urls.push('https://example.com/lonely/');
    const card = scoreAudit(orphan);
    expect(
      card.findings.some((f) => f.page === 'https://example.com/lonely/' && f.check === 'internal links'),
    ).toBe(true);
    expect(area(card, 8).points).toBe(2); // 1 of 6
    const partial = healthy();
    partial.crawl.complete = false;
    partial.crawl.pages[4]!.depth = 4;
    const result = area(scoreAudit(partial), 8);
    expect(result.points).toBe(2);
    expect(result.evidence).toContain('orphans not checked');
    const fine = healthy();
    fine.crawl.complete = false;
    expect(area(scoreAudit(fine), 8).points).toBe(3);
    const noSitemap = healthy();
    noSitemap.sitemaps.urls = [];
    expect(area(scoreAudit(noSitemap), 8).evidence).toContain('no sitemap to compare');
  });

  it('counts broken links and redirect chains, internal ones as serious', () => {
    const evidence = healthy();
    evidence.links.checked.push(
      { url: 'https://example.com/gone/', from: HOME, internal: true, status: 404, hops: 0 },
      { url: 'https://other.org/', from: HOME, internal: false, status: 0, hops: 0, error: 'timeout' },
      { url: 'https://other.org/moved', from: HOME, internal: false, status: 200, hops: 2 },
    );
    evidence.links.leftUnchecked = 7;
    const card = scoreAudit(evidence);
    expect(area(card, 9).points).toBe(0); // 3 of 8
    expect(area(card, 9).evidence).toContain('7 left unchecked');
    expect(card.findings.filter((f) => f.check === 'broken links').map((f) => f.severity)).toEqual([
      'serious',
      'warning',
    ]);
    const one = healthy();
    one.links.checked = Array.from({ length: 50 }, (_, i) => ({
      url: `${HOME}${i}`,
      from: HOME,
      internal: true,
      status: i ? 200 : 500,
      hops: 0,
    }));
    expect(area(scoreAudit(one), 9).points).toBe(3);
  });

  it('grades speed against the Core Web Vitals limits and takes the slowest page', () => {
    const base: SpeedResult = {
      url: HOME,
      strategy: 'mobile',
      source: 'lab',
      lcpMs: 2000,
      interactionMs: 100,
      interactionMetric: 'TBT',
      cls: 0.05,
      readAt: AT,
    };
    expect(pointsForSpeed(base)).toBe(4);
    expect(pointsForSpeed({ ...base, lcpMs: 3000 })).toBe(3);
    expect(pointsForSpeed({ ...base, lcpMs: 5000, cls: 0.3 })).toBe(0);
    expect(pointsForSpeed({ ...base, interactionMs: 550 })).toBe(3); // TBT allows up to 600 before poor
    expect(pointsForSpeed({ ...base, interactionMetric: 'INP', interactionMs: 550 })).toBe(2);
    expect(pointsForSpeed({ ...base, lcpMs: null })).toBeNull();
    const evidence = healthy();
    evidence.speed.results.push({ ...base, url: 'https://example.com/a/', lcpMs: 4500 });
    const card = scoreAudit(evidence);
    expect(area(card, 10).points).toBe(2);
    expect(area(card, 10).evidence).toContain('lab data is one simulated load');
    const unusable = healthy();
    unusable.speed.results = [{ ...base, lcpMs: null, error: 'no data' }];
    expect(area(scoreAudit(unusable), 10).status).toBe('not-checked');
    const slow = healthy();
    slow.speed.results = [{ ...base, lcpMs: 6000, interactionMs: 700, cls: null }];
    expect(scoreAudit(slow).findings.find((f) => f.check === 'speed')!.severity).toBe('serious');
  });

  it('checks the analytics tag against the privacy page', () => {
    const unnamed = healthy();
    unnamed.crawl.pages[0]!.analytics = ['Google Analytics', 'Meta Pixel'];
    expect(area(scoreAudit(unnamed), 13).points).toBe(2);
    const missingTag = healthy();
    missingTag.crawl.pages[1]!.tagIds = [];
    expect(area(scoreAudit(missingTag), 13).points).toBe(2);
    const otherOnly = healthy();
    for (const p of otherOnly.crawl.pages) {
      p.tagIds = [];
      p.analytics = ['Plausible'];
    }
    otherOnly.privacy.mentions = ['Plausible'];
    otherOnly.crawl.pages[0]!.cspAnalytics = ['Google Analytics'];
    expect(area(scoreAudit(otherOnly), 13).points).toBe(3);
    expect(area(scoreAudit(otherOnly), 13).evidence).toContain('probably loaded by a script');
    const nothing = healthy();
    for (const p of nothing.crawl.pages) {
      p.tagIds = [];
      p.analytics = [];
    }
    expect(area(scoreAudit(nothing), 13).points).toBe(1);
    const noPrivacy = healthy();
    noPrivacy.privacy = { readAt: AT, url: null, status: 0, mentions: [] };
    const card = scoreAudit(noPrivacy);
    expect(area(card, 13).points).toBe(1);
    expect(area(card, 13).evidence).toContain('no privacy page linked');
  });

  it('marks every page-level area not checked when no HTML page was read', () => {
    const evidence = healthy();
    evidence.crawl.pages = evidence.crawl.pages.map((p) => ({ ...p, isHtml: false }));
    const card = scoreAudit(evidence);
    expect(area(card, 5)).toMatchObject({
      status: 'not-checked',
      evidence: 'not checked: no HTML pages could be read',
    });
  });

  it('uses the scorecard bands and share steps', () => {
    expect([band(80), band(79), band(40), band(39)]).toEqual([
      'healthy',
      'fixable gaps',
      'real problems',
      'urgent',
    ]);
    expect([0, 0.1, 0.3, 0.6, 0.61].map(pointsForShare)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('the report files', () => {
  it('writes the scorecard table, rules, findings and what was not verified', () => {
    const evidence = healthy();
    evidence.crawl.complete = false;
    evidence.speed = { readAt: AT, results: [], notChecked: 'no PAGESPEED_API_KEY set' };
    evidence.crawl.pages[1]!.title = null;
    const card = scoreAudit(evidence);
    const md = renderMarkdown(card, evidence);
    expect(md).toContain('# Website visibility audit: example.com');
    expect(md).toContain('| 3 | Pages stored by Google | 3 | needs owner access | — |');
    expect(md).toContain('| 10 | Speed for real visitors | 2 | not checked |');
    expect(md).toContain('2026-10-30 12:00 UTC');
    expect(md).toContain('The crawl stopped at its cap of 50 pages');
    expect(md).toContain('- Speed: no PAGESPEED_API_KEY set.');
    expect(md).toContain('**serious** (titles) https://example.com/a/: no title');
  });

  it('says so when nothing could be scored', () => {
    const card = { ...scoreAudit(healthy()), scaled: null };
    expect(renderMarkdown(card, healthy())).toContain('Nothing could be scored.');
  });

  it('quotes CSV fields and leaves page text out of the JSON', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', 'say "hi"'],
          [null, 3],
        ],
      ),
    ).toBe('a,b\r\n"x,y","say ""hi"""\r\n,3\r\n');
    const evidence = healthy();
    const card = scoreAudit(evidence);
    expect(findingsCsv(card).split('\r\n')[0]).toBe('page,check,severity,detail');
    const pages = pagesCsv(evidence).split('\r\n');
    expect(pages[1]).toMatch(/^https:\/\/example\.com\/,200,0,/);
    expect(pages[1]).toContain(',5,5,'); // five links in, five out
    const json = JSON.parse(reportJson(card, evidence));
    expect(json.scorecard.points).toBe(76);
    expect(json.evidence.crawl.pages[0].text).toBeUndefined();
  });
});
