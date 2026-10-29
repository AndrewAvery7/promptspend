/**
 * Count one month of `docs/pricing-changelog.md` for the Price Movement Report.
 *
 *   npx tsx scripts/monthly-report-tally.ts 2026-10
 *
 * Prints Markdown with the previous month beside it. Run it on the 1st, after
 * the morning sync, so the whole month is in the log. It says plainly when the
 * month is not finished. The counting lives in `scripts/lib/changelog-tally.ts`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatTally, parseChangelog, previousMonth, tallyMonth } from './lib/changelog-tally';

async function main(): Promise<void> {
  const month = process.argv[2];
  if (!month) {
    console.error('usage: npx tsx scripts/monthly-report-tally.ts YYYY-MM');
    process.exitCode = 1;
    return;
  }
  const text = await readFile(resolve(import.meta.dirname, '../docs/pricing-changelog.md'), 'utf8');
  const entries = parseChangelog(text);
  process.stdout.write(formatTally(tallyMonth(entries, month), tallyMonth(entries, previousMonth(month))));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
