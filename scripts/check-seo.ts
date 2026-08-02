/**
 * Assert the built site is discoverable, shareable and internally consistent.
 *
 * Every check here covers something that fails *invisibly*. A canonical tag
 * pointing at the wrong host, a relative `og:image`, a `sitemap.xml` naming a
 * domain the site has moved away from, an internal link to a directory that was
 * never written — none of them break a page, none of them show up in a browser,
 * and all of them quietly cost search traffic. The built artifact is checked
 * rather than the source that produces it, because the whole point is that
 * these are generated.
 *
 *   npm run build && npm run check:seo
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEXNOW_KEY_FILE } from './lib/indexnow';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

/** Same defaulting as the build: an unset Actions variable arrives as `""`. */
const basePath = (process.env.BASE_PATH ?? '').trim() || '/promptspend/';

/** Social-preview crawlers do not resolve relative URLs. */
function absolute(value: string | undefined): boolean {
  return typeof value === 'string' && /^https:\/\/[^/]+\//.test(value);
}

function attr(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
}

/** Every generated `index.html` under dist, as site-relative paths. */
async function findPages(dir = DIST, prefix = '/'): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'data') continue;
      found.push(...(await findPages(join(dir, entry.name), `${prefix}${entry.name}/`)));
    } else if (entry.name === 'index.html' && prefix !== '/') {
      found.push(prefix);
    }
  }
  return found.sort();
}

/**
 * Does this href point at something that exists in the artifact?
 *
 * The generated pages link to each other by path, and a directory that was
 * never written produces a 404 nothing else in the build would notice — the
 * page renders perfectly, the link is just dead.
 */
function resolvesInDist(href: string): boolean {
  const path = href.split('#')[0]!.split('?')[0]!;
  if (!path.startsWith(basePath)) return true; // not ours to check
  const relative = path.slice(basePath.length);
  const target = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
  return existsSync(resolve(DIST, target));
}

interface PageReport {
  path: string;
  title: string;
  description: string;
}

async function checkGeneratedPage(path: string, problems: string[]): Promise<PageReport> {
  const html = await readFile(resolve(DIST, `${path.slice(1)}index.html`), 'utf8');
  const say = (message: string): void => void problems.push(`${path} ${message}`);

  const title = attr(html, /<title>([^<]*)<\/title>/) ?? '';
  const description = attr(html, /<meta name="description" content="([^"]*)"/) ?? '';
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);

  if (!title) say('has no <title>');
  else if (title.length > 70) say(`title is ${title.length} chars; keep it under 70`);
  if (!description) say('has no meta description');
  else if (description.length > 165) say(`description is ${description.length} chars; keep it under 165`);

  if (!absolute(canonical)) say(`canonical is missing or not absolute: ${canonical ?? '(none)'}`);
  else if (!canonical!.endsWith(path)) say(`canonical ${canonical} does not point at this page`);

  if (!/<script type="application\/ld\+json">/.test(html)) say('has no structured data');
  else {
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    try {
      JSON.parse(ld);
    } catch {
      say('has structured data that is not valid JSON');
    }
  }

  const csp = attr(html, /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!csp) say('has no Content Security Policy');
  else if (csp.includes('unsafe-inline')) say('policy permits unsafe-inline');

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1]!.replaceAll('&amp;', '&');
    if (/^(https?:|mailto:|data:|#)/.test(href)) continue;
    if (!resolvesInDist(href)) say(`links to ${href}, which is not in the build`);
  }

  return { path, title, description };
}

async function main(): Promise<void> {
  const indexPath = resolve(DIST, 'index.html');
  if (!existsSync(indexPath)) {
    console.error('✗ dist/index.html does not exist — run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const html = await readFile(indexPath, 'utf8');
  const problems: string[] = [];

  if (html.includes('%SITE_URL%')) {
    problems.push('the %SITE_URL% placeholder survived the build');
  }

  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (!canonical) problems.push('no canonical link');
  else if (!absolute(canonical)) problems.push(`canonical is not an absolute https URL: ${canonical}`);

  const ogImage = attr(html, /<meta property="og:image" content="([^"]*)"/);
  if (!ogImage) problems.push('no og:image — shares will render as a bare link');
  else if (!absolute(ogImage)) problems.push(`og:image is not absolute: ${ogImage}`);

  const ogUrl = attr(html, /<meta property="og:url" content="([^"]*)"/);
  if (!absolute(ogUrl)) problems.push('og:url is missing or not absolute');

  const title = attr(html, /<title>([^<]*)<\/title>/);
  if (!title) problems.push('no <title>');
  // Not a hard SEO rule, but past roughly 70 characters Google truncates and
  // the tail stops doing any work.
  else if (title.length > 70) problems.push(`<title> is ${title.length} chars; keep it under 70`);

  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/);
  if (!description) problems.push('no meta description');
  else if (description.length > 165) {
    problems.push(`meta description is ${description.length} chars; keep it under 165`);
  }

  if (!/<script type="application\/ld\+json">/.test(html)) {
    problems.push('no JSON-LD structured data');
  } else {
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    try {
      const parsed = JSON.parse(ld) as { url?: string };
      if (!absolute(parsed.url)) problems.push('JSON-LD url is missing or not absolute');
    } catch {
      problems.push('JSON-LD is not valid JSON');
    }
  }

  // The og:image has to exist as a file, not just as a URL in a tag.
  if (!existsSync(resolve(DIST, 'social-card.png'))) {
    problems.push('dist/social-card.png is missing — og:image points at a 404');
  }
  for (const file of ['robots.txt', 'sitemap.xml']) {
    if (!existsSync(resolve(DIST, file))) problems.push(`dist/${file} was not generated`);
  }
  // Without the key file every IndexNow submission is refused, and the only
  // sign is a 403 in a job nobody reads.
  if (!existsSync(resolve(DIST, INDEXNOW_KEY_FILE))) {
    problems.push(`dist/${INDEXNOW_KEY_FILE} is missing — IndexNow submissions would be refused`);
  }

  if (!existsSync(resolve(DIST, 'llms.txt'))) {
    problems.push('dist/llms.txt was not generated');
  } else {
    const llms = await readFile(resolve(DIST, 'llms.txt'), 'utf8');
    // It is an index, so it is worth checking it actually indexes something —
    // an empty catalog would still produce a well-formed but useless file.
    if (!llms.startsWith('# PromptSpend')) problems.push('llms.txt does not start with an H1');
    for (const path of ['/models/', '/compare/', '/data/pricing.json']) {
      if (!llms.includes(path)) problems.push(`llms.txt does not link to ${path}`);
    }
    if (canonical && !llms.includes(new URL(canonical).origin)) {
      problems.push('llms.txt does not use absolute URLs on the canonical host');
    }
  }

  // ------------------------------------------------------- generated pages

  const pages = await findPages();
  if (pages.length === 0) {
    problems.push('no generated pages found — did `npm run build:pages` run?');
  }

  const reports: PageReport[] = [];
  for (const path of pages) reports.push(await checkGeneratedPage(path, problems));

  // Duplicate titles are how a set of programmatic pages gets read as one page
  // repeated — which is exactly what they must not look like.
  for (const field of ['title', 'description'] as const) {
    const seen = new Map<string, string[]>();
    for (const report of reports) {
      seen.set(report[field], [...(seen.get(report[field]) ?? []), report.path]);
    }
    for (const [value, paths] of seen) {
      if (paths.length > 1) {
        problems.push(`${paths.length} pages share a ${field} (${paths.slice(0, 3).join(', ')}): ${value}`);
      }
    }
  }

  if (existsSync(resolve(DIST, 'sitemap.xml'))) {
    const sitemap = await readFile(resolve(DIST, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]!);
    const first = locs[0];
    if (canonical && first && !first.startsWith(new URL(canonical).origin)) {
      problems.push(`sitemap host (${first}) disagrees with the canonical host (${canonical})`);
    }
    if (locs.length !== new Set(locs).size) problems.push('sitemap.xml lists a URL twice');

    const listed = new Set(locs.map((loc) => new URL(loc).pathname));
    for (const path of pages) {
      // The sitemap carries absolute URLs, whose pathname already includes the
      // base path; compare the two on the same footing.
      if (!listed.has(`${basePath}${path.slice(1)}`)) problems.push(`${path} is not in sitemap.xml`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ Discoverable — canonical ${canonical}`);
    console.log(`  title       ${title!.length} chars`);
    console.log(`  description ${description!.length} chars`);
    console.log(`  og:image    ${ogImage}`);
    console.log(`  generated   ${reports.length} pages: unique titles, valid data, every link resolves`);
    return;
  }
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
