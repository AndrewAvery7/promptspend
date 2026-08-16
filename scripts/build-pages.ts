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
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PricingCatalog } from '@/lib/pricing/types';
import { assertCatalog } from '@/lib/pricing/types';
import { buildPages } from '@/lib/seo/pages';
import { PAGE_CSS } from '@/lib/seo/css';
import { renderLlmsTxt } from '@/lib/seo/llms';
import { parseFrontmatter, renderMarkdown } from '@/lib/seo/prose';
import {
  renderComparisonPage,
  renderComparisonsIndex,
  renderInformationPage,
  renderModelPage,
  renderModelsIndex,
  renderProviderPage,
  renderProvidersIndex,
  renderWritingPage,
  type InformationPage,
  type RenderContext,
  type WritingPage,
} from '@/lib/seo/render';
import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from './lib/indexnow';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const CATALOG = resolve(ROOT, 'public/data/pricing.json');
const WRITING_DIR = resolve(ROOT, 'src/content/writing');
const INFORMATION_DIR = resolve(ROOT, 'src/content/information');

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
  const escapeXml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <priority>${escapeXml(entry.priority)}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Every `.md` file under `src/content/writing/`, turned into a page.
 *
 * A directory scan rather than an imported list, so the next article is a new
 * file, not a second place in the build that has to remember it exists.
 */
async function loadWritingPages(): Promise<WritingPage[]> {
  if (!existsSync(WRITING_DIR)) return [];
  const files = (await readdir(WRITING_DIR)).filter((name) => name.endsWith('.md'));
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(resolve(WRITING_DIR, file), 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      for (const field of ['slug', 'title', 'description', 'published']) {
        if (!meta[field]) throw new Error(`${file}: frontmatter is missing "${field}"`);
      }
      return {
        path: `/writing/${meta.slug}/`,
        title: meta.title!,
        description: meta.description!,
        heading: meta.title!,
        publishedDate: meta.published!,
        bodyHtml: renderMarkdown(body),
      };
    }),
  );
}

/** Durable public information pages used by the apps and store listings. */
async function loadInformationPages(): Promise<InformationPage[]> {
  if (!existsSync(INFORMATION_DIR)) return [];
  const files = (await readdir(INFORMATION_DIR)).filter((name) => name.endsWith('.md'));
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(resolve(INFORMATION_DIR, file), 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      for (const field of ['slug', 'title', 'description', 'heading', 'updated']) {
        if (!meta[field]) throw new Error(`${file}: frontmatter is missing "${field}"`);
      }
      return {
        path: `/${meta.slug}/`,
        title: meta.title!,
        description: meta.description!,
        heading: meta.heading!,
        updatedDate: meta.updated!,
        bodyHtml: renderMarkdown(body),
      };
    }),
  );
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

  // One value, used by both generated artifacts. It was computed inline at the
  // llms.txt call below and nowhere else, which was fine while llms.txt was the
  // only thing that named the API — and would have quietly let the pages' footer
  // and llms.txt point at different origins the first time this was overridden.
  const apiUrl = (process.env.PRICING_API_URL ?? '').trim() || 'https://promptspend.dev';

  const ctx: RenderContext = {
    siteUrl,
    basePath,
    cssPath: `/${cssName}`,
    hashInline: sha256Base64,
    generatedAt: catalog.generatedAt,
    apiUrl,
  };

  await writeFileAt(fileFor(set.modelsIndex.path), renderModelsIndex(set, ctx));
  await writeFileAt(fileFor(set.providersIndex.path), renderProvidersIndex(set, ctx));
  await writeFileAt(fileFor(set.comparisonsIndex.path), renderComparisonsIndex(set, ctx));
  for (const page of set.models) await writeFileAt(fileFor(page.path), renderModelPage(page, ctx));
  for (const page of set.providers) await writeFileAt(fileFor(page.path), renderProviderPage(page, ctx));
  for (const page of set.comparisons) await writeFileAt(fileFor(page.path), renderComparisonPage(page, ctx));

  // Prose pages, not part of the catalog-driven `PageSet`: `check-pages.ts`'s
  // page-count arithmetic is deliberately about the catalog alone, so these
  // are written and added to the sitemap here rather than folded into `set`.
  const writingPages = await loadWritingPages();
  for (const page of writingPages) await writeFileAt(fileFor(page.path), renderWritingPage(page, ctx));
  const informationPages = await loadInformationPages();
  for (const page of informationPages) {
    await writeFileAt(fileFor(page.path), renderInformationPage(page, ctx));
  }

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
      ...writingPages.map((page) => ({
        loc: `${siteUrl}${page.path}`,
        lastmod: page.publishedDate,
        priority: '0.6',
      })),
      ...informationPages.map((page) => ({
        loc: `${siteUrl}${page.path}`,
        lastmod: page.updatedDate,
        priority: '0.4',
      })),
    ]),
  );

  // An index written for the thing that reads it. Points at the pages and the
  // API rather than inlining rates, which would be stale by morning.
  await writeFileAt(
    'llms.txt',
    renderLlmsTxt(set, {
      siteUrl,
      apiUrl,
      generatedAt: catalog.generatedAt,
    }),
  );

  // Proof of control for IndexNow. Served as plain text at the site root; the
  // key is public by design — see scripts/lib/indexnow.ts.
  await writeFileAt(INDEXNOW_KEY_FILE, `${INDEXNOW_KEY}\n`);

  console.log(
    `✓ ${set.all.length + writingPages.length + informationPages.length} pages written under ${DIST}`,
  );
  console.log(
    `  ${set.models.length} models, ${set.providers.length} providers, ${set.comparisons.length} comparisons, 3 indexes, ${writingPages.length} writing, ${informationPages.length} information`,
  );
  console.log(`  stylesheet ${cssName}`);
  console.log(
    `  sitemap    ${set.all.length + writingPages.length + informationPages.length + 1} URLs at ${siteUrl}/sitemap.xml`,
  );
  console.log(`  llms.txt   ${siteUrl}/llms.txt`);
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
