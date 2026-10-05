/**
 * Export the price history as CSV, for the citable dataset release.
 *
 *   npm run export:price-history                  → price-history.csv
 *   npm run export:price-history -- --ref v0.7.0  → history up to that tag
 *   npm run export:price-history -- --out <path>
 *
 * Replays every commit on the first-parent line of `--ref` (default
 * `origin/main`, so an unpushed local branch cannot leak into a published
 * dataset) that touched `public/data/pricing.json`. The schema of the output is
 * documented in `docs/PRICE_HISTORY.md`.
 */
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PricingCatalog } from '../src/lib/pricing/types';
import { buildHistory, toCsv, type CatalogVersion } from './lib/price-history';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = 'public/data/pricing.json';

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? fallback;
}

const ref = flag('--ref', 'origin/main');
const out = resolve(ROOT, flag('--out', 'price-history.csv'));

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const log = git('log', '--first-parent', '--reverse', '--format=%H%x09%cI', ref, '--', CATALOG)
  .trim()
  .split('\n')
  .filter(Boolean);

const versions: CatalogVersion[] = log.map((line) => {
  const [commit = '', committedAt = ''] = line.split('\t');
  return {
    commit,
    committedAt,
    catalog: JSON.parse(git('show', `${commit}:${CATALOG}`)) as PricingCatalog,
  };
});

const rows = buildHistory(versions);
await writeFile(out, toCsv(rows), 'utf8');

const counts = rows.reduce<Record<string, number>>(
  (acc, r) => ({ ...acc, [r.change]: (acc[r.change] ?? 0) + 1 }),
  {},
);
console.log(`✓ ${rows.length} rows from ${versions.length} versions of ${CATALOG} (${ref}) → ${out}`);
for (const [change, n] of Object.entries(counts)) console.log(`  ${change.padEnd(10)} ${n}`);
