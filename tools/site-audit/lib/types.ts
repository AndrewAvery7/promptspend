/**
 * What the audit read, kept apart from what it concluded. The crawl fills an
 * `AuditEvidence`; `score.ts` turns it into a scorecard without touching the
 * network, which is what lets the scoring be tested from fixtures.
 */

export interface PageRecord {
  url: string;
  /** Final HTTP status after redirects; 0 when the request failed. */
  status: number;
  /** Clicks from the home page. */
  depth: number;
  /** Redirect hops followed to reach it. */
  hops: number;
  finalUrl: string;
  isHtml: boolean;
  title: string | null;
  description: string | null;
  canonical: string | null;
  canonicalIsAbsolute: boolean;
  wordCount: number;
  jsonLdTypes: string[];
  jsonLdErrors: number;
  internalLinks: string[];
  outboundLinks: string[];
  tagIds: string[];
  analytics: string[];
  /** Analytics the Content-Security-Policy allows but the HTML does not load (see html.ts). */
  cspAnalytics: string[];
  /** Links whose address or text mentions privacy. */
  privacyLinks: string[];
  /** Main-content text, used for near-duplicate detection; never written to the JSON output. */
  text: string;
  readAt: string;
}

export interface LinkCheck {
  url: string;
  /** A page the link was found on. */
  from: string;
  internal: boolean;
  status: number;
  hops: number;
  error?: string;
}

export interface SpeedResult {
  url: string;
  strategy: 'desktop' | 'mobile';
  /** `field` is real Chrome visitors to this address, `origin` real visitors to the whole site, `lab` one simulated load. */
  source: 'field' | 'origin' | 'lab';
  lcpMs: number | null;
  /** INP from field data; total blocking time when only lab data exists (a proxy, labeled as one). */
  interactionMs: number | null;
  interactionMetric: 'INP' | 'TBT';
  cls: number | null;
  error?: string;
  readAt: string;
}

export interface AuditEvidence {
  site: string;
  /** The home page after redirects. */
  home: string;
  userAgent: string;
  startedAt: string;
  finishedAt: string;
  robots: {
    readAt: string;
    /** HTTP status of /robots.txt; 0 when it could not be fetched. */
    status: number;
    sitemaps: string[];
    /** Whether the home page is disallowed for each crawler. */
    homeBlocked: { all: boolean; googlebot: boolean; bingbot: boolean };
    /** Sitemaps that robots.txt itself disallows. */
    sitemapsBlocked: string[];
  };
  sitemaps: {
    readAt: string;
    /** Sitemap files read, with how each parsed. */
    files: { url: string; status: number; kind: 'index' | 'urlset' | 'invalid' }[];
    urlCount: number;
    sampled: { url: string; status: number; hops: number }[];
    /** Every address listed, for the orphan check. */
    urls: string[];
  };
  crawl: {
    readAt: string;
    pages: PageRecord[];
    /** True when every reachable internal page was read before the page cap. */
    complete: boolean;
    maxPages: number;
    skippedByRobots: string[];
  };
  links: {
    readAt: string;
    checked: LinkCheck[];
    /** Why links were not checked, when they were not. */
    notChecked?: string;
    /** Links found but left unchecked by the cap. */
    leftUnchecked: number;
  };
  speed: {
    readAt: string;
    results: SpeedResult[];
    notChecked?: string;
  };
  privacy: {
    readAt: string;
    url: string | null;
    status: number;
    /** Analytics products the privacy page names. */
    mentions: string[];
  };
}
