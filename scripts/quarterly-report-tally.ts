/**
 * Count one quarter of `docs/pricing-changelog.md` for the State of LLM
 * Pricing report.
 *
 *   npx tsx scripts/quarterly-report-tally.ts 2026-Q4
 *   npx tsx scripts/quarterly-report-tally.ts 2026-Q4 --draft src/content/writing/2026-q4-state-of-llm-pricing.md
 *
 * Prints the tally as Markdown with the previous quarter beside it. With
 * `--draft <file>`, also writes the report as a writing page: front matter,
 * every figure filled in, and a TODO wherever a sentence needs a person. A
 * file in `src/content/writing/` is published by the next build, so a draft is
 * refused there until the quarter is complete (run it after the sync on the
 * 1st of the next quarter), and an existing file is never overwritten.
 *
 * Disputed-price flags still open are read from `public/data/pricing.json`,
 * the catalog in this checkout, and dated with its `generatedAt`. The counting
 * lives in `scripts/lib/quarterly-tally.ts`.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  formatQuarterTally,
  formatReportDraft,
  previousQuarter,
  tallyQuarter,
  type CatalogSnapshot,
} from './lib/quarterly-tally';

const ROOT = resolve(import.meta.dirname, '..');
const WRITING = resolve(ROOT, 'src/content/writing');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const quarter = args.find((arg) => !arg.startsWith('--'));
  const draftIndex = args.indexOf('--draft');
  const draft = draftIndex === -1 ? null : args[draftIndex + 1];
  if (!quarter || quarter === draft || (draftIndex !== -1 && !draft)) {
    console.error('usage: npx tsx scripts/quarterly-report-tally.ts YYYY-QN [--draft <file.md>]');
    process.exitCode = 1;
    return;
  }
  const text = await readFile(resolve(ROOT, 'docs/pricing-changelog.md'), 'utf8');
  const catalog = JSON.parse(
    await readFile(resolve(ROOT, 'public/data/pricing.json'), 'utf8'),
  ) as CatalogSnapshot;
  const current = tallyQuarter(text, catalog, quarter);
  const previous = tallyQuarter(text, catalog, previousQuarter(quarter));
  process.stdout.write(formatQuarterTally(current, previous));

  if (draft) {
    const path = resolve(draft);
    if (existsSync(path)) throw new Error(`${draft} already exists; move it aside or pick another path.`);
    if (!relative(WRITING, path).startsWith('..') && !current.quarterIsComplete) {
      throw new Error(
        `${current.quarter.name} is not complete (the log runs through ${current.logThrough}), and a file in src/content/writing/ is published by the next build. Write the draft somewhere else, or wait for ${current.quarter.next}.`,
      );
    }
    await writeFile(
      path,
      formatReportDraft(current, previous, new Date().toISOString().slice(0, 10)),
      'utf8',
    );
    console.error(`Draft written to ${draft}.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
