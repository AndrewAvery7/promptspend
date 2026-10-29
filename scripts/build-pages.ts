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
import { rm } from 'node:fs/promises';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PricingCatalog } from '@/lib/pricing/types';
import { assertCatalog } from '@/lib/pricing/types';
import { buildPages } from '@/lib/seo/pages';
import { Catalog } from '@/lib/pricing/catalog';
import { isSyncStatus, type SyncStatus } from '@/lib/pricing/health';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Ticker } from '@/components/Ticker';
import { assertFreeTiers } from '@/lib/free-tiers/types';
import { EMPTY_CHECK_REPORT, parseCheckReport } from '@/lib/free-tiers/check';
import { buildFreeTierPages, FREE_TIERS_PATH, publishedFreeTiers } from '@/lib/seo/free-tier-pages';
import { PAGE_CSS } from '@/lib/seo/css';
import { renderLlmsTxt } from '@/lib/seo/llms';
import { parseFrontmatter, renderMarkdown } from '@/lib/seo/prose';
import { receiptSpec } from '@/receipt/receiptSpec';
import { changesPageInput } from '@/lib/seo/changes-page';
import { sitemapIndex, urlset, type SitemapEntry, type SitemapFile } from '@/lib/seo/sitemap';
import { APP_PAGE_PATH } from '@/lib/links';
import {
  APP_PAGE_UPDATED,
  renderAppPage,
  renderComparisonPage,
  renderComparisonsIndex,
  renderFreeTierIndex,
  renderFreeTierPage,
  renderInformationPage,
  renderModelPage,
  renderModelsIndex,
  renderProviderPage,
  renderProvidersIndex,
  renderRetiredComparisonPage,
  renderChangesPage,
  renderDataPage,
  renderNotFoundPage,
  renderWritingIndex,
  renderWritingPage,
  CHANGES_PATH,
  DATA_PAGE_PATH,
  WRITING_INDEX_PATH,
  type DataPageInput,
  type FreeTierLink,
  type InformationPage,
  type RenderContext,
  type WritingPage,
} from '@/lib/seo/render';
import { INDEXNOW_KEY, INDEXNOW_KEY_FILE } from './lib/indexnow';
import { readLedger } from './lib/page-ledger';
import { renderFeed } from '../src/lib/seo/feed';
import { buildHistory, toCsv } from './lib/price-history';
import { loadCatalogVersions } from './price-history-git';
import type { PriceHistory } from '../src/lib/pricing/history';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const CATALOG = resolve(ROOT, 'public/data/pricing.json');
const WRITING_DIR = resolve(ROOT, 'src/content/writing');
const INFORMATION_DIR = resolve(ROOT, 'src/content/information');
const FREE_TIERS = resolve(ROOT, 'data/free-tiers.json');
const FREE_TIER_CHECK = resolve(ROOT, 'public/data/free-tier-check.json');
const SYNC_STATUS = resolve(ROOT, 'public/data/sync-status.json');

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

/**
 * Applies the visitor's saved theme, accent and canvas before the page paints.
 *
 * A file and not an inline script: the pages' Content Security Policy allows
 * scripts from this site and nothing inline. It has to block, because a script
 * that ran after first paint would show every dark-mode visitor a light page for
 * a moment on every navigation. It mirrors `useAppearance`: a saved choice wins,
 * and with none saved the operating system's dark setting decides the theme.
 */
const THEME_INIT = `(function(){var d=document.documentElement,g=function(k){try{return localStorage.getItem(k)}catch(e){return null}},t=g('ps.theme'),a=g('ps.accent'),c=g('ps.canvas');if(t!=='light'&&t!=='dark'){try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}if(['cobalt','emerald','teal','violet'].indexOf(a)<0)a='cobalt';if(c!=='cool'&&c!=='warm')c='cool';d.dataset.theme=t;d.dataset.accent=a;d.dataset.canvas=c})();
`;

interface ManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}

/**
 * Where Vite put the live header (`src/chrome/site-header.tsx`) and its
 * stylesheets, plus the theme script this build writes beside them.
 *
 * Fails the build rather than shipping pages with a header that never comes to
 * life: a missing entry means the build was run out of order.
 */
async function headerAssets(): Promise<NonNullable<RenderContext['chrome']>> {
  const manifestPath = resolve(DIST, '.vite/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('dist/.vite/manifest.json is missing - run `vite build` before `build:pages`.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, ManifestEntry>;
  const entryKey = 'src/chrome/site-header.tsx';
  if (!manifest[entryKey]) throw new Error(`${entryKey} is not in the Vite manifest.`);

  // The entry's own stylesheets, and those of anything it imports.
  const styles: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const entry = manifest[key];
    if (!entry) return;
    for (const imported of entry.imports ?? []) visit(imported);
    for (const sheet of entry.css ?? []) if (!styles.includes(`/${sheet}`)) styles.push(`/${sheet}`);
  };
  visit(entryKey);

  // The faces the header is drawn in, found by name rather than listed by hash.
  // These are the ones it actually uses: the wordmark, the nav and its buttons,
  // and the freshness line with its bold lead.
  const HEADER_FONTS = [
    'space-grotesk-latin-700-normal.woff2',
    'ibm-plex-sans-latin-400-normal.woff2',
    'ibm-plex-sans-latin-600-normal.woff2',
    'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-700-normal.woff2',
  ];
  // Vite names a font `<face>-<hash>.woff2`.
  const fonts = HEADER_FONTS.map((name) => {
    const face = name.replace('.woff2', '');
    const found = Object.values(manifest).find(
      (entry) => entry.file.startsWith(`assets/${face}-`) && entry.file.endsWith('.woff2'),
    );
    return found ? `/${found.file}` : null;
  }).filter((font): font is string => font !== null);
  if (fonts.length !== HEADER_FONTS.length) {
    throw new Error(
      `Expected ${HEADER_FONTS.length} header fonts in the Vite manifest, found ${fonts.length}.`,
    );
  }

  const themeInit = `assets/site-theme.${sha256Base64(THEME_INIT)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)}.js`;
  await writeFileAt(themeInit, THEME_INIT);
  return { script: `/${manifest[entryKey].file}`, themeInit: `/${themeInit}`, styles, fonts };
}

/** `/models/gpt-5/` becomes `models/gpt-5/index.html`. */
function fileFor(path: string): string {
  return `${path.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
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
  // The ledger is what keeps a published comparison published and gives every
  // page the date its content last changed rather than today's. See
  // src/lib/seo/ledger.ts.
  const ledger = await readLedger();
  const set = buildPages(catalog, { asOf, ledger });

  // Free-tier pages: hand-verified facts plus this morning's re-check of their
  // sources. The facts must cover exactly the catalog's providers; the report
  // is optional (a fresh clone has never run the check) and, if damaged, only
  // costs the pages their "still there on" dates.
  const freeTierRaw: unknown = JSON.parse(await readFile(FREE_TIERS, 'utf8'));
  assertFreeTiers(
    freeTierRaw,
    catalog.providers.map((provider) => provider.id),
  );
  const checkReport = existsSync(FREE_TIER_CHECK)
    ? parseCheckReport(JSON.parse(await readFile(FREE_TIER_CHECK, 'utf8')))
    : EMPTY_CHECK_REPORT;
  const freeTiers = buildFreeTierPages(freeTierRaw, checkReport, new Catalog(catalog), set, asOf);
  const freeTierLinks = new Map<string, FreeTierLink>(
    freeTiers.pages.map((page) => [page.providerId, { verdict: page.record.verdict, path: page.path }]),
  );

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

  // The figures the calculator's footer prints, so the pages' footer prints the
  // same ones. A missing or unreadable health file only costs the "sources
  // checked" date, exactly as it does in the browser.
  let health: SyncStatus | null = null;
  if (existsSync(SYNC_STATUS)) {
    const parsed: unknown = JSON.parse(await readFile(SYNC_STATUS, 'utf8'));
    if (isSyncStatus(parsed)) health = parsed;
  }
  const liveCatalog = new Catalog(catalog, health);

  // The live header the generated pages share with the calculator. Vite wrote
  // it, under hashed names, and said where in the manifest; the one thing it
  // cannot write is the theme script, which has to be a plain blocking file.
  const chrome = await headerAssets();

  // The price history, replayed from every committed catalog up to the commit
  // being built: the same table as the archived CSV dataset. It feeds the
  // model pages' history charts, the `as_of` lookups in the MCP server and the
  // API, and the Atom feed. A shallow checkout throws rather than publish a
  // one-day "history".
  const versions = loadCatalogVersions(ROOT, 'HEAD');
  const rows = buildHistory(versions);
  const history: PriceHistory = {
    schemaVersion: 1,
    firstDate: rows[0]?.date ?? catalog.generatedAt.slice(0, 10),
    lastDate: new Date(versions.at(-1)?.committedAt ?? catalog.generatedAt).toISOString().slice(0, 10),
    rows,
  };

  const ctx: RenderContext = {
    siteUrl,
    basePath,
    cssPath: `/${cssName}`,
    hashInline: sha256Base64,
    generatedAt: catalog.generatedAt,
    apiUrl,
    history,
    chrome,
    // The tape above the header, drawn from the same component the calculator
    // runs and dated by the catalog, so a rebuild of one commit is identical.
    ticker: renderToStaticMarkup(createElement(Ticker, { catalog: liveCatalog, asOf })),
    freshness: {
      models: liveCatalog.primaryModels.length,
      pricesChangedOn: liveCatalog.pricesLastChanged(),
      sourcesCheckedOn: liveCatalog.sourcesLastChecked(),
      degraded: health?.outcome === 'degraded',
    },
  };

  await writeFileAt(fileFor(set.modelsIndex.path), renderModelsIndex(set, ctx));
  await writeFileAt(fileFor(set.providersIndex.path), renderProvidersIndex(set, ctx, freeTierLinks));
  await writeFileAt(fileFor(set.comparisonsIndex.path), renderComparisonsIndex(set, ctx));
  for (const page of set.models) await writeFileAt(fileFor(page.path), renderModelPage(page, ctx));
  for (const page of set.providers) {
    await writeFileAt(fileFor(page.path), renderProviderPage(page, ctx, freeTierLinks.get(page.id)));
  }
  await writeFileAt(fileFor(FREE_TIERS_PATH), renderFreeTierIndex(freeTiers, ctx));
  for (const page of freeTiers.pages) await writeFileAt(fileFor(page.path), renderFreeTierPage(page, ctx));
  // The same facts as data, beside pricing.json: the file a script or another
  // site should read instead of scraping the pages.
  await writeFileAt(
    'data/free-tiers.json',
    `${JSON.stringify(publishedFreeTiers(freeTiers, catalog.generatedAt, checkReport.checkedAt), null, 2)}\n`,
  );
  for (const page of set.comparisons) await writeFileAt(fileFor(page.path), renderComparisonPage(page, ctx));
  // Published pairs that can no longer be built: a noindex signpost rather than
  // a 404. Deliberately absent from the sitemap below.
  for (const page of set.retiredComparisons) {
    await writeFileAt(fileFor(page.path), renderRetiredComparisonPage(page, ctx));
  }

  // Prose pages, not part of the catalog-driven `PageSet`: `check-pages.ts`'s
  // page-count arithmetic is deliberately about the catalog alone, so these
  // are written and added to the sitemap here rather than folded into `set`.
  const writingPages = await loadWritingPages();
  for (const page of writingPages) await writeFileAt(fileFor(page.path), renderWritingPage(page, ctx));
  const informationPages = await loadInformationPages();
  for (const page of informationPages) {
    await writeFileAt(fileFor(page.path), renderInformationPage(page, ctx));
  }
  // The permanent page for the two native apps. One page, hand-written copy,
  // so it sits beside the prose pages rather than in the catalog's page set.
  await writeFileAt(fileFor(APP_PAGE_PATH), renderAppPage(ctx));

  await writeFileAt(
    'data/price-history.json',
    `${JSON.stringify(history)}
`,
  );
  await writeFileAt('data/price-history.csv', toCsv(rows));

  // Price news as Atom, with corrections labeled apart from repricing. See src/lib/seo/feed.ts.
  await writeFileAt('feed.xml', renderFeed(history, siteUrl));

  // The pages that are neither catalog-driven nor prose from a file: the list
  // of articles, the open-data page, and the page GitHub Pages serves for an
  // address that does not exist.
  const newestFirstWriting = [...writingPages].sort(
    (a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.path.localeCompare(b.path),
  );
  if (writingPages.length > 0) {
    await writeFileAt(fileFor(WRITING_INDEX_PATH), renderWritingIndex(writingPages, ctx));
  }
  // The newest row's date moves only when a price does, so the open-data
  // page's date in the sitemap means something.
  const lastChangeDate =
    rows.reduce((newest, row) => (row.date > newest ? row.date : newest), '') || history.firstDate;
  const dataPage: DataPageInput = {
    models: set.models.length,
    providers: set.providers.length,
    history: { firstDate: history.firstDate, rows: rows.length, lastChangeDate },
  };
  await writeFileAt(fileFor(DATA_PAGE_PATH), renderDataPage(dataPage, ctx));
  const changes = changesPageInput(
    history,
    Object.fromEntries(set.models.map((page) => [page.id, page.path])),
  );
  await writeFileAt(fileFor(CHANGES_PATH), renderChangesPage(changes, ctx));
  await writeFileAt('404.html', renderNotFoundPage(ctx));

  // The sitemap lives here rather than in `vite.config.ts` because it has to
  // list these pages, and the config has no idea they exist.
  //
  // One file per kind of page, with `sitemap.xml` as the index over them, so
  // Search Console can say which kind is being indexed and which is being
  // left out. See src/lib/seo/sitemap.ts.
  //
  // Every `lastmod` is the date that page's content last changed, never the
  // build date. The calculator shows the same prices as the model table, so it
  // carries that table's date. Stamping every URL with today, as this used to,
  // told Google 170 pages changed every morning - and a crawler that is always
  // told everything changed stops believing `lastmod` at all.
  const entry = (path: string, lastmod: string): SitemapEntry => ({ loc: `${siteUrl}${path}`, lastmod });
  const newestArticle = newestFirstWriting[0]?.publishedDate;
  const files: SitemapFile[] = [
    {
      name: 'sitemap-site.xml',
      entries: [
        entry('/', set.modelsIndex.lastmod),
        entry('/receipt/', receiptSpec.updated),
        entry(APP_PAGE_PATH, APP_PAGE_UPDATED),
        ...set.all.filter((page) => page.kind === 'index').map((page) => entry(page.path, page.lastmod)),
        entry(freeTiers.index.path, freeTiers.index.lastmod),
        ...(newestArticle ? [entry(WRITING_INDEX_PATH, newestArticle)] : []),
        entry(DATA_PAGE_PATH, lastChangeDate),
        entry(CHANGES_PATH, changes.lastChangeDate),
        ...informationPages.map((page) => entry(page.path, page.updatedDate)),
      ],
    },
    { name: 'sitemap-models.xml', entries: set.models.map((page) => entry(page.path, page.lastmod)) },
    { name: 'sitemap-providers.xml', entries: set.providers.map((page) => entry(page.path, page.lastmod)) },
    { name: 'sitemap-compare.xml', entries: set.comparisons.map((page) => entry(page.path, page.lastmod)) },
    {
      name: 'sitemap-free-tiers.xml',
      entries: freeTiers.pages.map((page) => entry(page.path, page.lastmod)),
    },
    {
      name: 'sitemap-writing.xml',
      entries: writingPages.map((page) => entry(page.path, page.publishedDate)),
    },
  ];
  for (const file of files) {
    if (file.entries.length > 0) await writeFileAt(file.name, urlset(file.entries));
  }
  await writeFileAt('sitemap.xml', sitemapIndex(siteUrl, files));
  const sitemapUrls = files.reduce((sum, file) => sum + file.entries.length, 0);

  // An index written for the thing that reads it. Points at the pages and the
  // API rather than inlining rates, which would be stale by morning.
  await writeFileAt(
    'llms.txt',
    renderLlmsTxt(set, {
      siteUrl,
      apiUrl,
      generatedAt: catalog.generatedAt,
      freeTiers,
      writing: newestFirstWriting,
    }),
  );

  // Proof of control for IndexNow. Served as plain text at the site root; the
  // key is public by design — see scripts/lib/indexnow.ts.
  await writeFileAt(INDEXNOW_KEY_FILE, `${INDEXNOW_KEY}\n`);

  // The manifest was for this script; nothing should serve it.
  await rm(resolve(DIST, '.vite'), { recursive: true, force: true });

  const freeTierCount = freeTiers.pages.length + 1;
  console.log(
    `✓ ${set.all.length + writingPages.length + informationPages.length + freeTierCount + 3} pages written under ${DIST}`,
  );
  console.log(
    `  ${set.models.length} models, ${set.providers.length} providers, ${set.comparisons.length} comparisons, 3 indexes, ${writingPages.length} writing, ${informationPages.length} information, ${freeTierCount} free tier, 1 app, writing index, open-data page, 404`,
  );
  const kept = set.comparisons.filter((page) => page.kept).length;
  if (kept > 0) console.log(`  ${kept} comparison(s) kept because they were published before`);
  if (set.retiredComparisons.length > 0) {
    console.log(
      `  ${set.retiredComparisons.length} retired comparison signpost(s), noindex and not in the sitemap`,
    );
  }
  console.log(`  stylesheet ${cssName}`);
  console.log(
    `  sitemap    ${sitemapUrls} URLs in ${files.filter((file) => file.entries.length > 0).length} files, indexed at ${siteUrl}/sitemap.xml`,
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
