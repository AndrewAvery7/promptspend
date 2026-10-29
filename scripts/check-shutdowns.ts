/**
 * Daily shut-down check.
 *
 *   read each vendor's deprecation page -> find exact shutdown dates -> match
 *   them to the published catalog -> write public/data/shutdown-check.json
 *
 * Run by .github/workflows/sync-pricing.yml before the sync, which raises a
 * review flag on any still-live model whose shutdown date has passed. Needs no
 * keys: the pages are plain markdown or HTML tables. It never edits the
 * catalog and never fails the morning; an unreadable page is recorded as
 * unread. See scripts/lib/shutdowns.ts.
 *
 *   npm run check:shutdowns              # read, match, write the report
 *   npm run check:shutdowns -- --dry-run # read and match, write nothing
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PricingCatalog } from '../src/lib/pricing/types';
import {
  matchShutdowns,
  readNotices,
  SHUTDOWN_CHECK_SCHEMA_VERSION,
  SOURCES,
  type Notice,
  type ShutdownReport,
  type ShutdownSource,
} from './lib/shutdowns';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');
const REPORT_PATH = resolve(ROOT, 'public/data/shutdown-check.json');
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGE_CHARS = 2_000_000;

async function readPage(source: ShutdownSource): Promise<string> {
  // Ask for what the page is. Google serves a different body when markdown is
  // acceptable, and that body has no tables.
  const response = await fetch(source.url, {
    headers: {
      'user-agent': 'promptspend-shutdown-check',
      // Without it Google serves a machine translation chosen at random (zh-TW,
      // pt-BR were both seen), whose headers no longer say "Shutdown date".
      'accept-language': 'en',
      accept: source.format === 'markdown' ? 'text/markdown, text/plain' : 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_PAGE_CHARS) throw new Error(`page is ${text.length} characters, over the limit`);
  return text;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const checkedAt = new Date();
  const today = checkedAt.toISOString().slice(0, 10);
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as PricingCatalog;
  // Rows already archived are settled; asking about them again is noise.
  const live = catalog.models.filter((model) => model.status !== 'deprecated');

  const sources: ShutdownReport['sources'] = [];
  const results: { source: ShutdownSource; notices: Notice[] }[] = [];
  for (const source of SOURCES) {
    try {
      const notices = readNotices(source, await readPage(source));
      // A deprecations page with no dated rows at all has changed shape; say so
      // rather than report a clean bill of health.
      if (notices.length === 0) throw new Error('no dated rows found — the page layout may have changed');
      results.push({ source, notices });
      sources.push({ url: source.url, ok: true, notices: notices.length });
      console.log(`✓ ${source.label}: ${notices.length} dated model(s)`);
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      sources.push({ url: source.url, ok: false, notices: 0, note });
      console.warn(`::warning::could not read ${source.label} (${source.url}): ${note}`);
    }
  }

  const items = matchShutdowns({ models: live, results, today });
  for (const item of items) {
    console.log(
      `  ${item.shutDown ? '✗ SHUT DOWN' : '· scheduled'} ${item.id} (${item.vendorName}) on ${item.date}`,
    );
  }
  const overdue = items.filter((item) => item.shutDown);
  console.log(`→ ${overdue.length} live model(s) past their vendor's shutdown date`);

  const report: ShutdownReport = {
    schemaVersion: SHUTDOWN_CHECK_SCHEMA_VERSION,
    checkedAt: checkedAt.toISOString(),
    sources,
    items,
  };
  if (dryRun) {
    console.log('(dry run — nothing written)');
    return;
  }
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`✓ wrote ${REPORT_PATH}`);
}

main().catch((error: unknown) => {
  // Never fail the morning: the price sync runs regardless.
  console.warn(
    `::warning::shut-down check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
});
