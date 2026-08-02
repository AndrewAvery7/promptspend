/**
 * Generate the crawlable pages, after `vite build` has produced `dist/`.
 *
 * The calculator is one URL whose views are client state. That is the right
 * shape for a tool and the wrong shape for search: nobody types "LLM cost
 * estimator" into Google, they type "gpt-5.6 pricing" and "claude opus vs
 * gemini pro cost". This step gives every one of those questions a real page,
 * built from the same catalog and costed by the same engine as the app.
 *
 *   npm run build            # vite build, then this
 *   npm run build:pages      # just this, against an existing dist/
 *
 * Deliberately a post-build script rather than a Vite plugin. It needs the
 * finished `dist/`, it writes ~160 files, and keeping it out of the config
 * means `vite.config.ts` stays about building the app.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PricingCatalog } from '@/lib/pricing/types';
import { assertCatalog } from '@/lib/pricing/types';
import { buildPages } from '@/lib/seo/pages';
import { PAGE_CSS } from '@/lib/seo/css';
import {
  renderComparisonPage,
  renderComparisonsIndex,
  renderModelPage,
  renderModelsIndex,
  renderProviderPage,
  renderProvidersIndex,
  type RenderContext,
} from '@/lib/seo/render';
import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from './lib/indexnow';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const CATALOG = resolve(ROOT, 'public/data/pricing.json');

/** Same defaults as `vite.config.ts`, and for the same reasons: an unset
 *  GitHub Actions variable arrives as `""`, so `??` would not catch it. */
const siteUrl = ((process.env.SITE_URL ?? '').trim() || 'https://andrewavery7.github.io/promptspend').replace(
  /\/+$/,
  '',
);
const basePath = (process.env.BASE_PATH ?? '').trim() || '/promptspend/';

function sha256Base64(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('base64');
}

async function writeFileAt(relative: string, content: string): Promise<void> {
  const target = resolve(DIST, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

/** `/models/gpt-5/` becomes `models/gpt-5/index.html`. */
function fileFor(path: string): string {
  return `${path.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}

function sitemap(entries: { loc: string; lastmod: string; priority: string }[]): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    console.error('✗ dist/ does not exist — run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const raw: unknown = JSON.parse(await readFile(CATALOG, 'utf8'));
  assertCatalog(raw);
  const catalog: PricingCatalog = raw;

  // The catalog's own timestamp, not the wall clock. Two builds of the same
  // commit then produce byte-identical pages, which is what makes "did this
  // deploy change anything?" answerable.
  const asOf = new Date(catalog.generatedAt);
  const set = buildPages(catalog, { asOf });

  // Content-hashed, because these pages are served with whatever cache headers
  // GitHub Pages chooses and a fixed filename would leave visitors on the old
  // stylesheet after a change.
  const cssName = `assets/pages.${sha256Base64(PAGE_CSS)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)}.css`;
  await writeFileAt(cssName, PAGE_CSS);

  const ctx: RenderContext = {
    siteUrl,
    basePath,
    cssPath: `/${cssName}`,
    hashInline: sha256Base64,
    generatedAt: catalog.generatedAt,
  };

  await writeFileAt(fileFor(set.modelsIndex.path), renderModelsIndex(set, ctx));
  await writeFileAt(fileFor(set.providersIndex.path), renderProvidersIndex(set, ctx));
  await writeFileAt(fileFor(set.comparisonsIndex.path), renderComparisonsIndex(set, ctx));
  for (const page of set.models) await writeFileAt(fileFor(page.path), renderModelPage(page, ctx));
  for (const page of set.providers) await writeFileAt(fileFor(page.path), renderProviderPage(page, ctx));
  for (const page of set.comparisons) await writeFileAt(fileFor(page.path), renderComparisonPage(page, ctx));

  // The sitemap lives here rather than in `vite.config.ts` because it has to
  // list these pages, and the config has no idea they exist.
  const lastmod = catalog.generatedAt.slice(0, 10);
  await writeFileAt(
    'sitemap.xml',
    sitemap([
      { loc: `${siteUrl}/`, lastmod, priority: '1.0' },
      ...set.all.map((page) => ({
        loc: `${siteUrl}${page.path}`,
        lastmod: page.lastmod,
        priority: page.kind === 'index' ? '0.8' : page.kind === 'model' ? '0.7' : '0.5',
      })),
    ]),
  );

  // Proof of control for IndexNow. Served as plain text at the site root; the
  // key is public by design — see scripts/lib/indexnow.ts.
  await writeFileAt(INDEXNOW_KEY_FILE, `${INDEXNOW_KEY}\n`);

  console.log(`✓ ${set.all.length} pages written under ${DIST}`);
  console.log(
    `  ${set.models.length} models, ${set.providers.length} providers, ${set.comparisons.length} comparisons, 3 indexes`,
  );
  console.log(`  stylesheet ${cssName}`);
  console.log(`  sitemap    ${set.all.length + 1} URLs at ${siteUrl}/sitemap.xml`);
  if (set.droppedComparisons > 0) {
    // Never silent. A capped page set that looks complete is how a coverage
    // regression hides for months.
    console.log(`  note: ${set.droppedComparisons} qualifying comparison(s) dropped by the page ceiling`);
  }
}

main().catch((cause: unknown) => {
  console.error(`::error::${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
});
