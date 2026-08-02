/**
 * Assert the built page is discoverable and shareable.
 *
 * Every check here covers something that fails *invisibly*. A canonical tag
 * pointing at the wrong host, a relative `og:image`, a `sitemap.xml` naming a
 * domain the site has moved away from — none of them break the page, none of
 * them show up in a browser, and all of them quietly cost search traffic. The
 * built artifact is checked rather than the source that produces it, because
 * the whole point is that these are generated.
 *
 *   npm run build && npm run check:seo
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

/** Social-preview crawlers do not resolve relative URLs. */
function absolute(value: string | undefined): boolean {
  return typeof value === 'string' && /^https:\/\/[^/]+\//.test(value);
}

function attr(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
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

  if (existsSync(resolve(DIST, 'sitemap.xml'))) {
    const sitemap = await readFile(resolve(DIST, 'sitemap.xml'), 'utf8');
    const loc = /<loc>([^<]*)<\/loc>/.exec(sitemap)?.[1];
    if (canonical && loc && !loc.startsWith(new URL(canonical).origin)) {
      problems.push(`sitemap host (${loc}) disagrees with the canonical host (${canonical})`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ Discoverable — canonical ${canonical}`);
    console.log(`  title      ${title!.length} chars`);
    console.log(`  description ${description!.length} chars`);
    console.log(`  og:image   ${ogImage}`);
    return;
  }
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
