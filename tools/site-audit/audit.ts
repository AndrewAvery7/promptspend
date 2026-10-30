/**
 * One-command audit of a public website, scored against the Crestwood Holdings
 * audit scorecard.
 *
 *   npx tsx tools/site-audit/audit.ts https://www.example.com
 *   npx tsx tools/site-audit/audit.ts https://www.example.com --max-pages 200 --mobile --skip-broken-links
 *
 * Passive and polite by construction: GET and HEAD only, robots.txt obeyed,
 * one request at a time with a pause between them, an honest User-Agent, no
 * cookies kept, no logins, no forms. PageSpeed Insights runs only when
 * PAGESPEED_API_KEY is set. Audit only sites whose owner has agreed to it.
 *
 * Writes `<out-dir>/<domain>-<yyyy-MM-dd>/` holding report.md, report.json,
 * findings.csv, pages.csv and raw/ (robots.txt, sitemaps, PageSpeed JSON), and
 * prints a one-line summary. Exit code 0 when the audit finished, whatever the
 * score; 1 when it could not run. See tools/site-audit/README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuditCannotRun, runAudit, type Fetcher, type PageSpeedClient } from './lib/crawl';
import { findingsCsv, pagesCsv, renderMarkdown, reportJson, summaryLine } from './lib/report';
import { scoreAudit } from './lib/score';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROBOTS_TOKEN = 'CrestwoodSiteAudit';
const TEXT_TYPES = /text\/|xml|json|javascript/i;
const MAX_BODY = 5_000_000;

interface Args {
  site: string;
  maxPages: number;
  outDir: string;
  mobile: boolean;
  skipBrokenLinks: boolean;
  delayMs: number;
  sitemapSample: number;
  maxLinkChecks: number;
  contact: string;
}

const USAGE = `usage: npx tsx tools/site-audit/audit.ts <https://site> [options]
  --max-pages <n>        stop crawling after n pages (default 50, at most 500)
  --out-dir <dir>        where the report folder goes (default tools/site-audit/reports)
  --mobile               also run PageSpeed as a phone (needs PAGESPEED_API_KEY)
  --skip-broken-links    do not check links (faster)
  --delay-ms <n>         pause between requests (default 500, at least 250)
  --sitemap-sample <n>   sitemap addresses to check (default 20, at most 50)
  --max-link-checks <n>  links to check beyond crawled pages (default 100)
  --contact <address>    contact named in the User-Agent (default info@promptspend.com)`;

function parseArgs(argv: string[]): Args | string {
  const args: Args = {
    site: '',
    maxPages: 50,
    outDir: resolve(HERE, 'reports'),
    mobile: false,
    skipBrokenLinks: false,
    delayMs: 500,
    sitemapSample: 20,
    maxLinkChecks: 100,
    contact: 'info@promptspend.com',
  };
  const number = (flag: string, value: string | undefined, min: number, max: number): number | string => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max)
      return `${flag} must be a whole number from ${min} to ${max}`;
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    const take = (): string | undefined => {
      i += 1;
      return value;
    };
    let result: number | string | undefined;
    switch (flag) {
      case '--mobile':
        args.mobile = true;
        break;
      case '--skip-broken-links':
        args.skipBrokenLinks = true;
        break;
      case '--max-pages':
        result = number(flag, take(), 1, 500);
        if (typeof result === 'number') args.maxPages = result;
        break;
      case '--delay-ms':
        result = number(flag, take(), 250, 60_000);
        if (typeof result === 'number') args.delayMs = result;
        break;
      case '--sitemap-sample':
        result = number(flag, take(), 0, 50);
        if (typeof result === 'number') args.sitemapSample = result;
        break;
      case '--max-link-checks':
        result = number(flag, take(), 0, 1000);
        if (typeof result === 'number') args.maxLinkChecks = result;
        break;
      case '--out-dir':
        args.outDir = resolve(take() ?? '');
        break;
      case '--contact':
        args.contact = take() ?? '';
        break;
      default:
        if (flag.startsWith('--')) return `unknown option ${flag}`;
        args.site = flag;
    }
    if (typeof result === 'string') return result;
  }
  if (!args.site) return 'give the site to audit, starting with https://';
  if (!args.contact.trim()) return '--contact cannot be empty';
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** One request at a time, `delayMs` apart, with the audit's User-Agent and nothing else. */
function politeFetcher(userAgent: string, delayMs: number): Fetcher {
  let last = 0;
  return async (url, method) => {
    const wait = last + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const response = await fetch(url, {
        method,
        redirect: 'manual',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(20_000),
      });
      const contentType = response.headers.get('content-type') ?? '';
      let body = '';
      if (method === 'GET' && TEXT_TYPES.test(contentType)) body = (await response.text()).slice(0, MAX_BODY);
      else await response.body?.cancel();
      return { status: response.status, location: response.headers.get('location'), contentType, body };
    } finally {
      last = Date.now();
    }
  };
}

function pageSpeedClient(key: string): PageSpeedClient {
  return async (url, strategy) => {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    endpoint.searchParams.set('category', 'performance');
    // The key travels in a header, not the address, so it never lands in a log line.
    const response = await fetch(endpoint, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`PageSpeed answered ${response.status}`);
    return response.json();
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === 'string') {
    console.error(`${parsed}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const userAgent = `${ROBOTS_TOKEN}/1.0 (+https://github.com/AndrewAvery7/promptspend/tree/main/tools/site-audit; read-only website audit by Crestwood Holdings; contact ${parsed.contact})`;
  console.log('Reminder: audit only sites whose owner has agreed to it.');

  let host: string;
  try {
    host = new URL(parsed.site).hostname;
  } catch {
    console.error(`"${parsed.site}" is not a web address.`);
    process.exitCode = 1;
    return;
  }
  const folder = join(parsed.outDir, `${host}-${new Date().toISOString().slice(0, 10)}`);
  const raw = join(folder, 'raw');
  const key = process.env.PAGESPEED_API_KEY?.trim();

  try {
    await mkdir(raw, { recursive: true });
    const evidence = await runAudit(
      {
        site: parsed.site,
        userAgent,
        robotsToken: ROBOTS_TOKEN,
        maxPages: parsed.maxPages,
        sitemapSample: parsed.sitemapSample,
        maxLinkChecks: parsed.maxLinkChecks,
        skipBrokenLinks: parsed.skipBrokenLinks,
        mobile: parsed.mobile,
      },
      {
        fetch: politeFetcher(userAgent, parsed.delayMs),
        ...(key ? { pagespeed: pageSpeedClient(key) } : {}),
        saveRaw: (name, content) => writeFile(join(raw, name), content, 'utf8'),
        log: (line) => console.log(`  ${line}`),
      },
    );
    const card = scoreAudit(evidence);
    const reportPath = join(folder, 'report.md');
    await writeFile(reportPath, renderMarkdown(card, evidence), 'utf8');
    await writeFile(join(folder, 'report.json'), reportJson(card, evidence), 'utf8');
    await writeFile(join(folder, 'findings.csv'), findingsCsv(card), 'utf8');
    await writeFile(join(folder, 'pages.csv'), pagesCsv(evidence), 'utf8');
    console.log(summaryLine(card, relative(process.cwd(), reportPath) || reportPath));
  } catch (error) {
    if (error instanceof AuditCannotRun) console.error(`Could not audit: ${error.message}`);
    else console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  }
}

void main();
