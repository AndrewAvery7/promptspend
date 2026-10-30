/**
 * The read-only half of the audit: robots.txt, sitemaps, a capped crawl, link
 * checks and (with a key) PageSpeed. Every request goes through the injected
 * `Fetcher`, so the polite pacing, the User-Agent and the redirect handling
 * live in one place and the whole sequence can run against fixtures.
 *
 * It only ever sends GET and HEAD. It never follows a form, never sends a
 * cookie it was given, and never reads a page robots.txt asks it not to.
 */
import { extractPage, PRIVACY_MENTIONS, visibleText } from './html';
import { EMPTY_ROBOTS, isAllowed, parseRobots, robotsPath, type Robots } from './robots';
import { parseSitemap, spreadSample } from './sitemap';
import type { AuditEvidence, LinkCheck, PageRecord, SpeedResult } from './types';

export interface HttpResponse {
  status: number;
  /** The Location header on a redirect. */
  location: string | null;
  contentType: string;
  /** Empty for HEAD. */
  body: string;
}

export type Fetcher = (url: string, method: 'GET' | 'HEAD') => Promise<HttpResponse>;

/** Calls the PageSpeed Insights API and hands back its JSON. */
export type PageSpeedClient = (url: string, strategy: 'desktop' | 'mobile') => Promise<unknown>;

export interface AuditOptions {
  site: string;
  userAgent: string;
  /** The product token robots.txt groups are matched against. */
  robotsToken: string;
  maxPages: number;
  sitemapSample: number;
  maxLinkChecks: number;
  skipBrokenLinks: boolean;
  mobile: boolean;
}

export interface AuditDeps {
  fetch: Fetcher;
  pagespeed?: PageSpeedClient;
  now?: () => Date;
  /** Saves a raw file (robots.txt, a sitemap, PageSpeed JSON) as evidence. */
  saveRaw?: (name: string, content: string) => Promise<void>;
  log?: (line: string) => void;
}

/** The audit could not run at all (exit code 1), as opposed to finding problems. */
export class AuditCannotRun extends Error {}

const MAX_HOPS = 5;
const MAX_SITEMAP_FILES = 20;
const MAX_OUTBOUND_HOSTS = 20;

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
}

function bareHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

export interface Followed {
  status: number;
  finalUrl: string;
  hops: number;
  response: HttpResponse | null;
  error?: string;
}

/** Follow redirects by hand, so the number of hops is known. */
export async function follow(fetcher: Fetcher, url: string, method: 'GET' | 'HEAD'): Promise<Followed> {
  let current = url;
  for (let hops = 0; hops <= MAX_HOPS; hops += 1) {
    let response: HttpResponse;
    try {
      response = await fetcher(current, method);
    } catch (error) {
      return {
        status: 0,
        finalUrl: current,
        hops,
        response: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, current).href;
      continue;
    }
    return { status: response.status, finalUrl: current, hops, response };
  }
  return { status: 0, finalUrl: current, hops: MAX_HOPS, response: null, error: 'too many redirects' };
}

/** HEAD first; GET when the server refuses HEAD. */
async function check(fetcher: Fetcher, url: string): Promise<Followed> {
  const head = await follow(fetcher, url, 'HEAD');
  if (head.status === 405 || head.status === 501 || head.status === 403 || head.status === 0) {
    return follow(fetcher, url, 'GET');
  }
  return head;
}

function isHtml(response: HttpResponse | null): boolean {
  return !!response && /text\/html|application\/xhtml/i.test(response.contentType);
}

async function readRobots(
  fetcher: Fetcher,
  origin: string,
): Promise<{ status: number; robots: Robots; body: string }> {
  const result = await follow(fetcher, `${origin}/robots.txt`, 'GET');
  if (result.status === 200 && result.response) {
    return { status: 200, robots: parseRobots(result.response.body), body: result.response.body };
  }
  return { status: result.status, robots: EMPTY_ROBOTS, body: '' };
}

function numberAt(value: unknown, path: string[]): number | null {
  let node: unknown = value;
  for (const key of path) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'number' && Number.isFinite(node) ? node : null;
}

/** Field data for the address, else for the whole site, else the lab run. */
export function readPageSpeed(
  json: unknown,
  url: string,
  strategy: 'desktop' | 'mobile',
  readAt: string,
): SpeedResult {
  for (const [key, source] of [
    ['loadingExperience', 'field'],
    ['originLoadingExperience', 'origin'],
  ] as const) {
    const lcp = numberAt(json, [key, 'metrics', 'LARGEST_CONTENTFUL_PAINT_MS', 'percentile']);
    if (lcp !== null) {
      const cls = numberAt(json, [key, 'metrics', 'CUMULATIVE_LAYOUT_SHIFT_SCORE', 'percentile']);
      return {
        url,
        strategy,
        source,
        lcpMs: lcp,
        interactionMs: numberAt(json, [key, 'metrics', 'INTERACTION_TO_NEXT_PAINT', 'percentile']),
        interactionMetric: 'INP',
        // The API reports layout shift multiplied by 100.
        cls: cls === null ? null : cls / 100,
        readAt,
      };
    }
  }
  const audits = ['lighthouseResult', 'audits'];
  const lcp = numberAt(json, [...audits, 'largest-contentful-paint', 'numericValue']);
  if (lcp === null) {
    return {
      url,
      strategy,
      source: 'lab',
      lcpMs: null,
      interactionMs: null,
      interactionMetric: 'TBT',
      cls: null,
      error: 'no PageSpeed data in the response',
      readAt,
    };
  }
  return {
    url,
    strategy,
    source: 'lab',
    lcpMs: lcp,
    interactionMs: numberAt(json, [...audits, 'total-blocking-time', 'numericValue']),
    interactionMetric: 'TBT',
    cls: numberAt(json, [...audits, 'cumulative-layout-shift', 'numericValue']),
    readAt,
  };
}

export async function runAudit(options: AuditOptions, deps: AuditDeps): Promise<AuditEvidence> {
  const now = deps.now ?? (() => new Date());
  const stamp = (): string => now().toISOString();
  const log = deps.log ?? (() => {});
  const save = deps.saveRaw ?? (async () => {});
  const fetcher = deps.fetch;
  const startedAt = stamp();

  let site: string;
  try {
    site = normalizeUrl(options.site);
  } catch {
    throw new AuditCannotRun(`"${options.site}" is not a web address`);
  }
  if (!/^https?:/.test(site)) throw new AuditCannotRun(`"${options.site}" is not an http or https address`);

  // robots.txt first: nothing else is read until we know we may.
  const origin = new URL(site).origin;
  log(`Reading ${origin}/robots.txt`);
  const robotsRead = await readRobots(fetcher, origin);
  const robotsReadAt = stamp();
  if (robotsRead.status >= 500 || robotsRead.status === 0) {
    throw new AuditCannotRun(
      `${origin}/robots.txt answered ${robotsRead.status || 'nothing'}. Google treats an unreadable robots.txt as "do not crawl", so this audit does too.`,
    );
  }
  if (robotsRead.body) await save('robots.txt', robotsRead.body);
  const robots = robotsRead.robots;
  const sitePath = robotsPath(site);
  if (!isAllowed(robots, options.robotsToken, sitePath)) {
    throw new AuditCannotRun(`robots.txt asks crawlers like this one not to read ${site}.`);
  }

  const homeRead = await follow(fetcher, site, 'GET');
  if (homeRead.status !== 200 || !isHtml(homeRead.response)) {
    throw new AuditCannotRun(
      `${site} answered ${homeRead.status || homeRead.error || 'nothing'}${homeRead.status === 200 ? ' but is not an HTML page' : ''}.`,
    );
  }
  const home = homeRead.finalUrl;
  const homeHost = bareHost(home);
  const isInternal = (url: string): boolean => {
    try {
      return bareHost(url) === homeHost;
    } catch {
      return false;
    }
  };
  const homePath = robotsPath(home);
  const homeBlocked = {
    all: !isAllowed(robots, '*', homePath),
    googlebot: !isAllowed(robots, 'googlebot', homePath),
    bingbot: !isAllowed(robots, 'bingbot', homePath),
  };

  // Sitemaps: from robots.txt, else the conventional address.
  const sitemapQueue =
    robots.sitemaps.length > 0 ? [...robots.sitemaps] : [`${new URL(home).origin}/sitemap.xml`];
  const sitemapsBlocked = robots.sitemaps.filter(
    (url) => isInternal(url) && !isAllowed(robots, 'googlebot', robotsPath(url)),
  );
  const files: AuditEvidence['sitemaps']['files'] = [];
  const sitemapUrls: string[] = [];
  const seenSitemaps = new Set<string>();
  while (sitemapQueue.length > 0 && files.length < MAX_SITEMAP_FILES) {
    const url = sitemapQueue.shift()!;
    if (seenSitemaps.has(url)) continue;
    seenSitemaps.add(url);
    if (isInternal(url) && !isAllowed(robots, options.robotsToken, robotsPath(url))) continue;
    log(`Reading sitemap ${url}`);
    const read = await follow(fetcher, url, 'GET');
    if (read.status !== 200 || !read.response) {
      files.push({ url, status: read.status, kind: 'invalid' });
      continue;
    }
    const parsed = parseSitemap(read.response.body);
    files.push({ url, status: read.status, kind: parsed.kind });
    await save(`sitemap-${files.length}.xml`, read.response.body);
    if (parsed.kind === 'index') sitemapQueue.push(...parsed.locs);
    else sitemapUrls.push(...parsed.locs);
  }
  const uniqueSitemapUrls = [...new Set(sitemapUrls.map((url) => normalizeUrl(url)))];
  const sampled: AuditEvidence['sitemaps']['sampled'] = [];
  for (const url of spreadSample(uniqueSitemapUrls, options.sitemapSample)) {
    if (isInternal(url) && !isAllowed(robots, options.robotsToken, robotsPath(url))) continue;
    const result = await check(fetcher, url);
    sampled.push({ url, status: result.status, hops: result.hops });
  }
  const sitemapsReadAt = stamp();

  // The crawl: breadth first from the home page, internal links only.
  log(`Crawling up to ${options.maxPages} pages`);
  const pages: PageRecord[] = [];
  const skippedByRobots: string[] = [];
  const queued = new Set<string>([home]);
  const queue: { url: string; depth: number; prefetched?: Followed }[] = [
    { url: home, depth: 0, prefetched: homeRead },
  ];
  while (queue.length > 0 && pages.length < options.maxPages) {
    const { url, depth, prefetched } = queue.shift()!;
    if (!isAllowed(robots, options.robotsToken, robotsPath(url))) {
      skippedByRobots.push(url);
      continue;
    }
    const read = prefetched ?? (await follow(fetcher, url, 'GET'));
    const html = isHtml(read.response) && read.status === 200 && isInternal(read.finalUrl);
    const record: PageRecord = {
      url,
      status: read.status,
      depth,
      hops: read.hops,
      finalUrl: read.finalUrl,
      isHtml: html,
      title: null,
      description: null,
      canonical: null,
      canonicalIsAbsolute: false,
      wordCount: 0,
      jsonLdTypes: [],
      jsonLdErrors: 0,
      internalLinks: [],
      outboundLinks: [],
      tagIds: [],
      analytics: [],
      cspAnalytics: [],
      privacyLinks: [],
      text: '',
      readAt: stamp(),
    };
    if (html && read.response) {
      const page = extractPage(read.response.body, read.finalUrl);
      Object.assign(record, {
        title: page.title,
        description: page.description,
        canonical: page.canonical,
        canonicalIsAbsolute: page.canonicalIsAbsolute,
        wordCount: page.wordCount,
        jsonLdTypes: page.jsonLdTypes,
        jsonLdErrors: page.jsonLdErrors,
        internalLinks: page.links.filter((link) => isInternal(link.url)).map((link) => link.url),
        outboundLinks: page.links.filter((link) => !isInternal(link.url)).map((link) => link.url),
        tagIds: page.tagIds,
        analytics: page.analytics,
        cspAnalytics: page.cspAnalytics,
        privacyLinks: page.links
          .filter((link) => isInternal(link.url) && /privacy/i.test(`${link.url} ${link.text}`))
          .map((link) => link.url),
        text: page.text,
      });
      for (const next of record.internalLinks) {
        if (queued.has(next)) continue;
        queued.add(next);
        queue.push({ url: next, depth: depth + 1 });
      }
    }
    pages.push(record);
  }
  const crawlComplete = queue.every((item) => !isAllowed(robots, options.robotsToken, robotsPath(item.url)));
  const crawlReadAt = stamp();

  // Link checks: crawled pages are already known; check the rest once each, internal first.
  const checked: LinkCheck[] = [];
  let leftUnchecked = 0;
  let notChecked: string | undefined;
  const crawledByUrl = new Map(pages.map((page) => [page.url, page]));
  const linkSources = new Map<string, { from: string; internal: boolean }>();
  for (const page of pages) {
    for (const url of page.internalLinks)
      if (!linkSources.has(url)) linkSources.set(url, { from: page.url, internal: true });
  }
  for (const page of pages) {
    for (const url of page.outboundLinks)
      if (!linkSources.has(url)) linkSources.set(url, { from: page.url, internal: false });
  }
  if (options.skipBrokenLinks) {
    notChecked = 'skipped on request (--skip-broken-links)';
  } else {
    const outboundRobots = new Map<string, Robots>();
    let budget = options.maxLinkChecks;
    for (const [url, source] of linkSources) {
      const known = crawledByUrl.get(url);
      if (known) {
        checked.push({ url, from: source.from, internal: true, status: known.status, hops: known.hops });
        continue;
      }
      if (budget <= 0) {
        leftUnchecked += 1;
        continue;
      }
      let rules = robots;
      if (!source.internal) {
        const linkOrigin = new URL(url).origin;
        let cached = outboundRobots.get(linkOrigin);
        if (!cached) {
          if (outboundRobots.size >= MAX_OUTBOUND_HOSTS) {
            leftUnchecked += 1;
            continue;
          }
          cached = (await readRobots(fetcher, linkOrigin)).robots;
          outboundRobots.set(linkOrigin, cached);
        }
        rules = cached;
      }
      if (!isAllowed(rules, options.robotsToken, robotsPath(url))) continue;
      budget -= 1;
      const result = await check(fetcher, url);
      checked.push({
        url,
        from: source.from,
        internal: source.internal,
        status: result.status,
        hops: result.hops,
        ...(result.error ? { error: result.error } : {}),
      });
    }
  }
  const linksReadAt = stamp();

  // Speed: only with an API key.
  const speed: AuditEvidence['speed'] = { readAt: stamp(), results: [] };
  if (!deps.pagespeed) {
    speed.notChecked = 'no PAGESPEED_API_KEY set';
  } else {
    const targets = [
      home,
      ...pages
        .filter((page) => page.isHtml && page.depth > 0)
        .sort((a, b) => a.depth - b.depth)
        .slice(0, 4)
        .map((page) => page.finalUrl),
    ];
    const strategies: ('desktop' | 'mobile')[] = options.mobile ? ['desktop', 'mobile'] : ['desktop'];
    for (const url of [...new Set(targets)]) {
      for (const strategy of strategies) {
        log(`PageSpeed (${strategy}) ${url}`);
        try {
          const json = await deps.pagespeed(url, strategy);
          await save(`pagespeed-${speed.results.length + 1}-${strategy}.json`, JSON.stringify(json, null, 2));
          speed.results.push(readPageSpeed(json, url, strategy, stamp()));
        } catch (error) {
          speed.results.push({
            url,
            strategy,
            source: 'lab',
            lcpMs: null,
            interactionMs: null,
            interactionMetric: 'TBT',
            cls: null,
            error: error instanceof Error ? error.message : String(error),
            readAt: stamp(),
          });
        }
      }
    }
    speed.readAt = stamp();
  }

  // Privacy: the first privacy link on the home page, else anywhere in the crawl.
  const homeRecord = pages[0]!;
  const privacyUrl =
    homeRecord.privacyLinks[0] ?? pages.find((page) => page.privacyLinks.length > 0)?.privacyLinks[0] ?? null;
  const privacy: AuditEvidence['privacy'] = { readAt: stamp(), url: privacyUrl, status: 0, mentions: [] };
  if (privacyUrl && isAllowed(robots, options.robotsToken, robotsPath(privacyUrl))) {
    const read = await follow(fetcher, privacyUrl, 'GET');
    privacy.status = read.status;
    if (read.status === 200 && read.response) {
      const text = visibleText(read.response.body);
      privacy.mentions = Object.entries(PRIVACY_MENTIONS)
        .filter(([, pattern]) => pattern.test(text))
        .map(([name]) => name);
    }
    privacy.readAt = stamp();
  }

  return {
    site,
    home,
    userAgent: options.userAgent,
    startedAt,
    finishedAt: stamp(),
    robots: {
      readAt: robotsReadAt,
      status: robotsRead.status,
      sitemaps: robots.sitemaps,
      homeBlocked,
      sitemapsBlocked,
    },
    sitemaps: {
      readAt: sitemapsReadAt,
      files,
      urlCount: uniqueSitemapUrls.length,
      sampled,
      urls: uniqueSitemapUrls,
    },
    crawl: {
      readAt: crawlReadAt,
      pages,
      complete: crawlComplete,
      maxPages: options.maxPages,
      skippedByRobots,
    },
    links: { readAt: linksReadAt, checked, leftUnchecked, ...(notChecked ? { notChecked } : {}) },
    speed,
    privacy,
  };
}
