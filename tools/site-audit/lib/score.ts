/**
 * Evidence in, scorecard out, following the Crestwood Holdings audit
 * scorecard: thirteen areas, 0 to 4 points each, multiplied by a weight, the
 * weights totaling 25. This tool can score ten of the thirteen from public
 * pages; the other three need the owner's Search Console or Bing access and
 * are reported as such, never guessed.
 *
 * The point rules below are the tool's judgment and are written out in the
 * report beside each score, so an operator can disagree with a number for a
 * stated reason. A check that did not run is "not checked", never a pass.
 */
import type { AuditEvidence, PageRecord, SpeedResult } from './types';

export type Severity = 'serious' | 'warning' | 'info';

export interface Finding {
  page: string;
  check: string;
  severity: Severity;
  detail: string;
}

export interface AreaScore {
  number: number;
  area: string;
  weight: number;
  status: 'scored' | 'not-checked' | 'owner-access';
  points: number | null;
  score: number | null;
  evidence: string;
  /** The rule that produced the points, so the score can be argued with. */
  rule: string;
  readAt: string | null;
}

export interface Scorecard {
  site: string;
  readAt: string;
  areas: AreaScore[];
  findings: Finding[];
  scoredAreas: number;
  points: number;
  possible: number;
  /** Points scaled to 100 over the areas scored; null when nothing was scored. */
  scaled: number | null;
  band: string | null;
  serious: number;
}

export const AREAS: { number: number; area: string; weight: number }[] = [
  { number: 1, area: 'Search engine access', weight: 3 },
  { number: 2, area: 'Sitemaps', weight: 2 },
  { number: 3, area: 'Pages stored by Google', weight: 3 },
  { number: 4, area: 'Duplicate and canonical pages', weight: 2 },
  { number: 5, area: 'Titles and descriptions', weight: 2 },
  { number: 6, area: 'Structured data', weight: 1 },
  { number: 7, area: 'Content depth', weight: 3 },
  { number: 8, area: 'Internal links', weight: 2 },
  { number: 9, area: 'Broken links and redirects', weight: 1 },
  { number: 10, area: 'Speed for real visitors', weight: 2 },
  { number: 11, area: 'Outside links', weight: 2 },
  { number: 12, area: 'Search performance', weight: 1 },
  { number: 13, area: 'Measurement and privacy', weight: 1 },
];

const OWNER_ACCESS: Record<number, string> = {
  3: 'Search Console Pages report',
  11: 'Search Console and Bing backlink reports',
  12: 'Search Console performance report',
};

export const TITLE_RANGE = [30, 60] as const;
export const DESCRIPTION_RANGE = [70, 160] as const;
export const THIN_WORDS = 300;
export const NEAR_DUPLICATE = 0.9;
export const MAX_DEPTH = 3;

const ORGANIZATION_TYPES = new Set([
  'Organization',
  'LocalBusiness',
  'Corporation',
  'OnlineBusiness',
  'OnlineStore',
  'Store',
  'Restaurant',
  'ProfessionalService',
  'MedicalBusiness',
  'LegalService',
  'NGO',
  'EducationalOrganization',
]);

/** 4 when nothing is wrong, then down a point at 10%, 30% and 60% of pages affected. */
export function pointsForShare(share: number): number {
  if (share <= 0) return 4;
  if (share <= 0.1) return 3;
  if (share <= 0.3) return 2;
  if (share <= 0.6) return 1;
  return 0;
}

export function band(scaled: number): string {
  if (scaled >= 80) return 'healthy';
  if (scaled >= 60) return 'fixable gaps';
  if (scaled >= 40) return 'real problems';
  return 'urgent';
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function htmlPages(evidence: AuditEvidence): PageRecord[] {
  return evidence.crawl.pages.filter((page) => page.isHtml);
}

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i += 1) out.add(words.slice(i, i + 5).join(' '));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Pairs of pages whose main text is at least 90% the same five-word runs. */
export function nearDuplicates(pages: readonly PageRecord[]): [string, string, number][] {
  const sets = pages.map((page) => shingles(page.text));
  const pairs: [string, string, number][] = [];
  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const similarity = jaccard(sets[i]!, sets[j]!);
      if (similarity >= NEAR_DUPLICATE) pairs.push([pages[i]!.url, pages[j]!.url, similarity]);
    }
  }
  return pairs;
}

type AreaResult = Omit<AreaScore, 'number' | 'area' | 'weight' | 'score'>;

function scoreAccess(evidence: AuditEvidence, findings: Finding[]): AreaResult {
  const { robots } = evidence;
  const rule =
    '0 if the home page is blocked for Google, Bing or all crawlers; 1 if robots.txt blocks a sitemap; 3 if robots.txt is missing or lists no sitemap; else 4.';
  const blocked = Object.entries(robots.homeBlocked)
    .filter(([, isBlocked]) => isBlocked)
    .map(([name]) => (name === 'all' ? 'all crawlers' : name));
  let points = 4;
  const notes: string[] = [];
  if (blocked.length > 0) {
    points = 0;
    notes.push(`home page blocked for ${blocked.join(', ')}`);
    findings.push({
      page: evidence.home,
      check: 'robots.txt',
      severity: 'serious',
      detail: `Home page blocked for ${blocked.join(', ')}`,
    });
  } else if (robots.sitemapsBlocked.length > 0) {
    points = 1;
    notes.push(`robots.txt blocks its own sitemap (${robots.sitemapsBlocked.join(', ')})`);
    findings.push({
      page: robots.sitemapsBlocked[0]!,
      check: 'robots.txt',
      severity: 'serious',
      detail: 'Sitemap is disallowed by robots.txt',
    });
  } else if (robots.status !== 200) {
    points = 3;
    notes.push(`no robots.txt (HTTP ${robots.status}); crawlers may read everything`);
    findings.push({
      page: `${new URL(evidence.home).origin}/robots.txt`,
      check: 'robots.txt',
      severity: 'warning',
      detail: `robots.txt answered ${robots.status}`,
    });
  } else if (robots.sitemaps.length === 0) {
    points = 3;
    notes.push('robots.txt lists no sitemap');
    findings.push({
      page: `${new URL(evidence.home).origin}/robots.txt`,
      check: 'robots.txt',
      severity: 'warning',
      detail: 'No Sitemap line',
    });
  } else {
    notes.push(
      `robots.txt read; home page open to Google, Bing and all crawlers; ${robots.sitemaps.length} sitemap(s) listed`,
    );
  }
  if (evidence.crawl.skippedByRobots.length > 0) {
    notes.push(`${evidence.crawl.skippedByRobots.length} linked address(es) disallowed and not crawled`);
  }
  return { status: 'scored', points, evidence: notes.join('; '), rule, readAt: robots.readAt };
}

function scoreSitemaps(evidence: AuditEvidence, findings: Finding[]): AreaResult {
  const { sitemaps } = evidence;
  const rule =
    '0 if no sitemap was found; 1 if none parsed as valid XML or it lists no addresses; else by the share of sampled addresses not answering 200 directly: 0% is 4, up to 10% is 3, more is 2.';
  const valid = sitemaps.files.filter((file) => file.kind !== 'invalid');
  const readAt = sitemaps.readAt;
  if (sitemaps.files.length === 0 || sitemaps.files.every((file) => file.status !== 200)) {
    findings.push({ page: evidence.home, check: 'sitemap', severity: 'serious', detail: 'No sitemap found' });
    return { status: 'scored', points: 0, evidence: 'no sitemap found', rule, readAt };
  }
  for (const file of sitemaps.files.filter((f) => f.kind === 'invalid')) {
    findings.push({
      page: file.url,
      check: 'sitemap',
      severity: 'serious',
      detail: `Sitemap unreadable (HTTP ${file.status}, or not sitemap XML)`,
    });
  }
  if (valid.length === 0 || sitemaps.urlCount === 0) {
    return {
      status: 'scored',
      points: 1,
      evidence: `${sitemaps.files.length} sitemap file(s), none usable`,
      rule,
      readAt,
    };
  }
  const bad = sitemaps.sampled.filter((sample) => sample.status !== 200 || sample.hops > 0);
  for (const sample of bad) {
    findings.push({
      page: sample.url,
      check: 'sitemap',
      severity: sample.status >= 400 || sample.status === 0 ? 'serious' : 'warning',
      detail:
        sample.hops > 0
          ? `Listed address redirects (${sample.hops} hop(s)) before answering ${sample.status}`
          : `Listed address answers ${sample.status}`,
    });
  }
  const share = sitemaps.sampled.length === 0 ? 0 : bad.length / sitemaps.sampled.length;
  let points = share === 0 ? 4 : share <= 0.1 ? 3 : 2;
  if (sitemaps.files.some((file) => file.kind === 'invalid')) points = Math.min(points, 2);
  const indexes = sitemaps.files.filter((file) => file.kind === 'index').length;
  return {
    status: 'scored',
    points,
    evidence: `${valid.length} sitemap file(s)${indexes ? ` (${indexes} index)` : ''}, ${sitemaps.urlCount} addresses; ${sitemaps.sampled.length - bad.length} of ${sitemaps.sampled.length} sampled answered 200 directly`,
    rule,
    readAt,
  };
}

function scoreCanonical(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const rule =
    'By the share of crawled pages with a missing, relative or chained canonical: 0% is 4, up to 10% is 3, 30% is 2, 60% is 1, more is 0.';
  const canonicalOf = new Map(pages.map((page) => [page.finalUrl, page.canonical]));
  let problems = 0;
  let pointsElsewhere = 0;
  for (const page of pages) {
    let issue: string | null = null;
    if (!page.canonical) issue = 'No canonical';
    else if (!page.canonicalIsAbsolute) issue = 'Canonical is a relative address';
    else if (page.canonical !== page.finalUrl) {
      pointsElsewhere += 1;
      const next = canonicalOf.get(page.canonical);
      if (next && next !== page.canonical)
        issue = `Canonical chain: points to ${page.canonical}, which points to ${next}`;
    }
    if (issue) {
      problems += 1;
      findings.push({ page: page.url, check: 'canonical', severity: 'warning', detail: issue });
    }
  }
  const share = problems / pages.length;
  return {
    status: 'scored',
    points: pointsForShare(share),
    evidence: `${pages.length - problems} of ${pages.length} crawled pages have a clean canonical (${percent(share)} with a problem); ${pointsElsewhere} point to another address`,
    rule,
    readAt: evidence.crawl.readAt,
  };
}

function scoreTitles(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const rule = `A missing or duplicate title or description is serious and scores by share (0% is 4, up to 10% is 3, 30% is 2, 60% is 1); a title outside ${TITLE_RANGE[0]}-${TITLE_RANGE[1]} or description outside ${DESCRIPTION_RANGE[0]}-${DESCRIPTION_RANGE[1]} characters is minor and alone never takes the area below 2.`;
  const count = (values: (string | null)[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const value of values) if (value) map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  };
  const titles = count(pages.map((page) => page.title));
  const descriptions = count(pages.map((page) => page.description));
  let serious = 0;
  let minor = 0;
  for (const page of pages) {
    const issues: string[] = [];
    const lengthIssues: string[] = [];
    if (!page.title) issues.push('no title');
    else if ((titles.get(page.title) ?? 0) > 1) issues.push('duplicate title');
    else if (page.title.length < TITLE_RANGE[0] || page.title.length > TITLE_RANGE[1])
      lengthIssues.push(`title is ${page.title.length} characters`);
    if (!page.description) issues.push('no description');
    else if ((descriptions.get(page.description) ?? 0) > 1) issues.push('duplicate description');
    else if (
      page.description.length < DESCRIPTION_RANGE[0] ||
      page.description.length > DESCRIPTION_RANGE[1]
    ) {
      lengthIssues.push(`description is ${page.description.length} characters`);
    }
    if (issues.length > 0) {
      serious += 1;
      findings.push({ page: page.url, check: 'titles', severity: 'serious', detail: issues.join(', ') });
    }
    if (lengthIssues.length > 0) {
      minor += 1;
      findings.push({ page: page.url, check: 'titles', severity: 'info', detail: lengthIssues.join(', ') });
    }
  }
  const seriousShare = serious / pages.length;
  const minorShare = minor / pages.length;
  const lengthPoints = minorShare === 0 ? 4 : minorShare <= 0.25 ? 3 : 2;
  return {
    status: 'scored',
    points: Math.min(pointsForShare(seriousShare), lengthPoints),
    evidence: `${pages.length} pages: ${serious} missing or duplicate title/description, ${minor} outside the recommended length`,
    rule,
    readAt: evidence.crawl.readAt,
  };
}

function scoreStructuredData(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const rule =
    '4 with Organization (or LocalBusiness) markup on the home page and no parse errors; 2 with one but not the other; 1 with only broken markup; 0 with none.';
  const home = pages[0]!;
  const hasOrganization = home.jsonLdTypes.some((type) => ORGANIZATION_TYPES.has(type));
  const errors = pages.reduce((sum, page) => sum + page.jsonLdErrors, 0);
  const typed = pages.filter((page) => page.jsonLdTypes.length > 0).length;
  for (const page of pages.filter((p) => p.jsonLdErrors > 0)) {
    findings.push({
      page: page.url,
      check: 'structured data',
      severity: 'warning',
      detail: `${page.jsonLdErrors} JSON-LD block(s) do not parse`,
    });
  }
  if (!hasOrganization) {
    findings.push({
      page: home.url,
      check: 'structured data',
      severity: 'warning',
      detail: 'No Organization or LocalBusiness markup on the home page',
    });
  }
  let points: number;
  if (hasOrganization && errors === 0) points = 4;
  else if (hasOrganization || typed > 0) points = 2;
  else if (errors > 0) points = 1;
  else points = 0;
  const homeTypes = home.jsonLdTypes.length > 0 ? home.jsonLdTypes.join(', ') : 'none';
  return {
    status: 'scored',
    points,
    evidence: `home page types: ${homeTypes}; ${typed} of ${pages.length} pages carry JSON-LD; ${errors} parse error(s)`,
    rule,
    readAt: evidence.crawl.readAt,
  };
}

function scoreContent(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const rule = `By the share of pages under ${THIN_WORDS} words of main content or near-duplicates of another page (90% the same text): 0% is 4, up to 10% is 3, 30% is 2, 60% is 1, more is 0.`;
  const flagged = new Set<string>();
  for (const page of pages.filter((p) => p.wordCount < THIN_WORDS)) {
    flagged.add(page.url);
    findings.push({
      page: page.url,
      check: 'content',
      severity: 'warning',
      detail: `Thin page: ${page.wordCount} words`,
    });
  }
  const pairs = nearDuplicates(pages);
  for (const [a, b, similarity] of pairs) {
    flagged.add(b);
    findings.push({
      page: b,
      check: 'content',
      severity: 'warning',
      detail: `Near-duplicate of ${a} (${percent(similarity)} the same)`,
    });
  }
  const thin = pages.filter((p) => p.wordCount < THIN_WORDS).length;
  const words = pages.map((page) => page.wordCount).sort((a, b) => a - b);
  const median = words[Math.floor((words.length - 1) / 2)]!;
  const share = flagged.size / pages.length;
  return {
    status: 'scored',
    points: pointsForShare(share),
    evidence: `${pages.length} pages, median ${median} words; ${thin} under ${THIN_WORDS} words; ${pairs.length} near-duplicate pair(s); ${percent(share)} flagged`,
    rule,
    readAt: evidence.crawl.readAt,
  };
}

function scoreInternalLinks(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const { crawl, sitemaps } = evidence;
  const deep = pages.filter((page) => page.depth > MAX_DEPTH);
  for (const page of deep) {
    findings.push({
      page: page.url,
      check: 'internal links',
      severity: 'warning',
      detail: `${page.depth} clicks from the home page`,
    });
  }
  const linked = new Set<string>([
    evidence.home,
    ...crawl.pages.flatMap((page) => [...page.internalLinks, page.finalUrl]),
  ]);
  if (!crawl.complete || sitemaps.urls.length === 0) {
    const why = !crawl.complete
      ? `the crawl stopped at its cap of ${crawl.maxPages} pages before reaching every page, so orphans cannot be told from pages not yet reached`
      : 'there is no sitemap to compare against';
    return {
      status: 'scored',
      points: Math.min(3, pointsForShare(deep.length / pages.length)),
      evidence: `${deep.length} of ${pages.length} crawled pages more than ${MAX_DEPTH} clicks deep; orphans not checked: ${why}`,
      rule: `By the share of pages more than ${MAX_DEPTH} clicks deep or in the sitemap but linked from nowhere (0% is 4, up to 10% is 3, 30% is 2, 60% is 1); capped at 3 when orphans could not be checked.`,
      readAt: crawl.readAt,
    };
  }
  const orphans = sitemaps.urls.filter((url) => !linked.has(url));
  for (const url of orphans) {
    findings.push({
      page: url,
      check: 'internal links',
      severity: 'warning',
      detail: 'In the sitemap but linked from no crawled page',
    });
  }
  const share = (deep.length + orphans.length) / (pages.length + orphans.length);
  return {
    status: 'scored',
    points: pointsForShare(share),
    evidence: `whole site crawled (${pages.length} pages); ${orphans.length} orphan(s) of ${sitemaps.urls.length} sitemap addresses; ${deep.length} page(s) more than ${MAX_DEPTH} clicks deep`,
    rule: `By the share of pages more than ${MAX_DEPTH} clicks deep or in the sitemap but linked from nowhere: 0% is 4, up to 10% is 3, 30% is 2, 60% is 1, more is 0.`,
    readAt: crawl.readAt,
  };
}

function scoreBrokenLinks(evidence: AuditEvidence, findings: Finding[]): AreaResult {
  const { links } = evidence;
  const rule =
    'By the share of checked links that fail (4xx, 5xx, no answer) or take more than one redirect: 0% is 4, up to 2% is 3, 5% is 2, 15% is 1, more is 0.';
  if (links.notChecked || links.checked.length === 0) {
    return {
      status: 'not-checked',
      points: null,
      evidence: `not checked: ${links.notChecked ?? 'no links found'}`,
      rule,
      readAt: links.readAt,
    };
  }
  let broken = 0;
  let chains = 0;
  for (const link of links.checked) {
    if (link.status === 0 || link.status >= 400) {
      broken += 1;
      findings.push({
        page: link.from,
        check: 'broken links',
        severity: link.internal ? 'serious' : 'warning',
        detail: `${link.internal ? 'Internal' : 'Outbound'} link to ${link.url} ${link.status ? `answers ${link.status}` : `failed (${link.error ?? 'no answer'})`}`,
      });
    } else if (link.hops > 1) {
      chains += 1;
      findings.push({
        page: link.from,
        check: 'redirects',
        severity: 'warning',
        detail: `${link.url} takes ${link.hops} redirects`,
      });
    }
  }
  const share = (broken + chains) / links.checked.length;
  const points = share === 0 ? 4 : share <= 0.02 ? 3 : share <= 0.05 ? 2 : share <= 0.15 ? 1 : 0;
  return {
    status: 'scored',
    points,
    evidence: `${links.checked.length} links checked (${links.checked.filter((l) => l.internal).length} internal): ${broken} broken, ${chains} redirect chain(s)${links.leftUnchecked ? `; ${links.leftUnchecked} left unchecked by the cap` : ''}`,
    rule,
    readAt: links.readAt,
  };
}

/** 4 when all three are good; down one per metric needing improvement, two per poor one; 0 at worst. */
export function pointsForSpeed(result: SpeedResult): number | null {
  if (result.lcpMs === null) return null;
  const grade = (value: number | null, good: number, poor: number): number =>
    value === null ? 0 : value <= good ? 0 : value <= poor ? 1 : 2;
  const interactionLimits = result.interactionMetric === 'INP' ? [200, 500] : [200, 600];
  const penalty =
    grade(result.lcpMs, 2500, 4000) +
    grade(result.interactionMs, interactionLimits[0]!, interactionLimits[1]!) +
    grade(result.cls, 0.1, 0.25);
  return Math.max(0, 4 - penalty);
}

function scoreSpeed(evidence: AuditEvidence, findings: Finding[]): AreaResult {
  const { speed } = evidence;
  const rule =
    'Per tested page: 4 when largest content is 2.5 s or less, interaction 200 ms or less and layout shift 0.1 or less; minus 1 for each metric needing improvement and 2 for each poor one. The area takes the lowest page. Field data when Google has it, lab data otherwise.';
  if (speed.notChecked)
    return {
      status: 'not-checked',
      points: null,
      evidence: `not checked: ${speed.notChecked}`,
      rule,
      readAt: null,
    };
  const scored = speed.results
    .map((result) => ({ result, points: pointsForSpeed(result) }))
    .filter((item) => item.points !== null);
  if (scored.length === 0) {
    return {
      status: 'not-checked',
      points: null,
      evidence: 'not checked: PageSpeed returned no usable data',
      rule,
      readAt: speed.readAt,
    };
  }
  for (const { result, points } of scored) {
    if (points! < 4) {
      findings.push({
        page: result.url,
        check: 'speed',
        severity: points! <= 1 ? 'serious' : 'warning',
        detail: `${result.strategy}, ${result.source} data: LCP ${result.lcpMs} ms, ${result.interactionMetric} ${result.interactionMs ?? 'n/a'} ms, CLS ${result.cls ?? 'n/a'}`,
      });
    }
  }
  const lowest = Math.min(...scored.map((item) => item.points!));
  const homeResult = scored.find((item) => item.result.url === evidence.home)?.result ?? scored[0]!.result;
  const sources = [...new Set(scored.map((item) => item.result.source))].join(', ');
  return {
    status: 'scored',
    points: lowest,
    evidence: `${scored.length} test(s), ${sources} data; home page LCP ${Math.round(homeResult.lcpMs!)} ms, ${homeResult.interactionMetric} ${homeResult.interactionMs === null ? 'n/a' : `${Math.round(homeResult.interactionMs)} ms`}, CLS ${homeResult.cls ?? 'n/a'}${sources.includes('lab') ? ' (lab data is one simulated load, indicative only)' : ''}`,
    rule,
    readAt: speed.readAt,
  };
}

function scoreMeasurement(evidence: AuditEvidence, pages: PageRecord[], findings: Finding[]): AreaResult {
  const rule =
    '4 when one GA4 id is on every sampled page and the privacy page names every analytics product found; 3 when the only analytics is not GA4 but is named; 2 when tags are missing on some pages, ids differ, or the privacy page omits a product; 1 with no analytics at all or no privacy page. The operator confirms the privacy wording by reading it.';
  const sample = [
    pages[0]!,
    ...pages
      .slice(1)
      .filter((_, i, rest) => i % Math.max(1, Math.floor(rest.length / 5)) === 0)
      .slice(0, 5),
  ];
  const gaIds = new Set(sample.flatMap((page) => page.tagIds.filter((id) => id.startsWith('G-'))));
  const withGa = sample.filter((page) => page.tagIds.some((id) => id.startsWith('G-'))).length;
  const products = [...new Set(sample.flatMap((page) => page.analytics))];
  const scriptLoaded = [...new Set(sample.flatMap((page) => page.cspAnalytics))].filter(
    (name) => !products.includes(name),
  );
  const { privacy } = evidence;
  const unnamed = products.filter((product) => !privacy.mentions.includes(product));
  const notes = [
    `GA4 tag on ${withGa} of ${sample.length} sampled pages${gaIds.size ? ` (${[...gaIds].join(', ')})` : ''}`,
    `analytics seen: ${products.length ? products.join(', ') : 'none'}`,
    ...(scriptLoaded.length
      ? [
          `${scriptLoaded.join(', ')} allowed by the Content-Security-Policy but not in the HTML, so probably loaded by a script this audit does not run (confirm in a browser)`,
        ]
      : []),
    privacy.url
      ? `privacy page ${privacy.url} (HTTP ${privacy.status}) names: ${privacy.mentions.length ? privacy.mentions.join(', ') : 'none of them'}`
      : 'no privacy page linked',
  ];
  let points: number;
  if (!privacy.url || privacy.status !== 200) {
    points = 1;
    findings.push({
      page: evidence.home,
      check: 'privacy',
      severity: 'serious',
      detail: 'No readable privacy page linked',
    });
  } else if (products.length === 0) {
    points = 1;
    findings.push({
      page: evidence.home,
      check: 'measurement',
      severity: 'serious',
      detail: 'No analytics found on the sampled pages',
    });
  } else if (unnamed.length > 0) {
    points = 2;
    findings.push({
      page: privacy.url,
      check: 'privacy',
      severity: 'warning',
      detail: `Privacy page does not name: ${unnamed.join(', ')}`,
    });
  } else if (gaIds.size === 0) {
    points = 3;
  } else if (withGa < sample.length || gaIds.size > 1) {
    points = 2;
    findings.push({
      page: evidence.home,
      check: 'measurement',
      severity: 'warning',
      detail: `GA4 tag on ${withGa} of ${sample.length} sampled pages, ${gaIds.size} id(s)`,
    });
  } else {
    points = 4;
  }
  return { status: 'scored', points, evidence: notes.join('; '), rule, readAt: privacy.readAt };
}

export function scoreAudit(evidence: AuditEvidence): Scorecard {
  const findings: Finding[] = [];
  const pages = htmlPages(evidence);
  const results: Record<number, AreaResult> = {};
  results[1] = scoreAccess(evidence, findings);
  results[2] = scoreSitemaps(evidence, findings);
  if (pages.length > 0) {
    results[4] = scoreCanonical(evidence, pages, findings);
    results[5] = scoreTitles(evidence, pages, findings);
    results[6] = scoreStructuredData(evidence, pages, findings);
    results[7] = scoreContent(evidence, pages, findings);
    results[8] = scoreInternalLinks(evidence, pages, findings);
    results[13] = scoreMeasurement(evidence, pages, findings);
  }
  results[9] = scoreBrokenLinks(evidence, findings);
  results[10] = scoreSpeed(evidence, findings);

  const areas: AreaScore[] = AREAS.map((meta) => {
    const owner = OWNER_ACCESS[meta.number];
    if (owner) {
      return {
        ...meta,
        status: 'owner-access',
        points: null,
        score: null,
        evidence: `needs owner access (${owner})`,
        rule: 'Scored by hand from the owner’s accounts.',
        readAt: null,
      };
    }
    const result = results[meta.number] ?? {
      status: 'not-checked' as const,
      points: null,
      evidence: 'not checked: no HTML pages could be read',
      rule: '',
      readAt: null,
    };
    return { ...meta, ...result, score: result.points === null ? null : result.points * meta.weight };
  });
  const scoredAreas = areas.filter((area) => area.status === 'scored');
  const points = scoredAreas.reduce((sum, area) => sum + area.score!, 0);
  const possible = scoredAreas.reduce((sum, area) => sum + area.weight * 4, 0);
  const scaled = possible === 0 ? null : Math.round((points / possible) * 100);
  return {
    site: evidence.home,
    readAt: evidence.finishedAt,
    areas,
    findings,
    scoredAreas: scoredAreas.length,
    points,
    possible,
    scaled,
    band: scaled === null ? null : band(scaled),
    serious: findings.filter((finding) => finding.severity === 'serious').length,
  };
}
