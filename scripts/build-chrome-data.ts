/**
 * Bake the freshness figures and the freshness tape into a file for the build.
 *
 * The Receipt page is drawn by script and learns the catalog only after a fetch,
 * so its tape and the "prices last changed" line used to appear a few hundred
 * milliseconds after everything else. `vite.config.ts` reads the file this writes
 * and hands the contents to the page, which shows them at once and swaps in the
 * live ones when its fetch returns.
 *
 * It is a separate step, run by `npm run build` just before Vite, because the
 * Vite config is loaded without the project's path aliases and so cannot import
 * the component that draws the tape. This script runs under `tsx`, which can.
 *
 *   npm run build:chrome
 *
 * The output (`.generated/chrome.json`) is not committed: it is a snapshot of
 * `public/data/`, and a stale one would be a snapshot of old prices.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeShell } from '@/components/HomeShell';
import { Ticker } from '@/components/Ticker';
import { Catalog } from '@/lib/pricing/catalog';
import { isSyncStatus, type SyncStatus } from '@/lib/pricing/health';
import { assertCatalog } from '@/lib/pricing/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'public/data');
const OUT = resolve(ROOT, '.generated/chrome.json');
/** Replaced with the real base path by `vite.config.ts` (`buildTimeChrome`). */
const HOME_SHELL_BASE = '/__PS_BASE__/';

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(await readFile(resolve(DATA, 'pricing.json'), 'utf8'));
  assertCatalog(raw);

  let health: SyncStatus | null = null;
  const statusPath = resolve(DATA, 'sync-status.json');
  if (existsSync(statusPath)) {
    const parsed: unknown = JSON.parse(await readFile(statusPath, 'utf8'));
    if (isSyncStatus(parsed)) health = parsed;
  }
  const catalog = new Catalog(raw, health);

  const data = {
    freshness: {
      pricesChangedOn: catalog.pricesLastChanged(),
      sourcesCheckedOn: catalog.sourcesLastChecked(),
      degraded: health?.outcome === 'degraded',
    },
    // Dated by the catalog, not the clock, so a rebuild of one commit is identical.
    tickerHtml: renderToStaticMarkup(createElement(Ticker, { catalog, asOf: new Date(raw.generatedAt) })),
    // The homepage's tape, header and hero, written into index.html so the
    // headline paints before the app's script has run (src/components/HomeShell.tsx).
    // The base path is a placeholder: Vite knows it, this script does not.
    homeShellHtml: renderToStaticMarkup(
      createElement(HomeShell, { base: HOME_SHELL_BASE, catalog, asOf: new Date(raw.generatedAt) }),
    ),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(data)}\n`, 'utf8');
  console.log(`✓ chrome data: prices last changed ${data.freshness.pricesChangedOn ?? 'never recorded'}`);
}

main().catch((cause: unknown) => {
  console.error(`::error::${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
});
