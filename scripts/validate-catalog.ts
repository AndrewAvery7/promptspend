/**
 * Guard rail for CI: the published catalog must always satisfy the schema the
 * app expects, including after a hand-edit or a merged pull request.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, type PricingCatalog } from '../src/lib/pricing/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as PricingCatalog;
const errors = validateCatalog(catalog);

if (errors.length > 0) {
  console.error(`✗ ${CATALOG_PATH} is invalid:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const flagged = catalog.models.filter((model) => model.provenance.needsReview).length;
console.log(
  `✓ catalog valid — ${catalog.models.length} models, ${catalog.providers.length} providers, ` +
    `${flagged} flagged for review, generated ${catalog.generatedAt}`,
);

/**
 * The README badges have to agree with the catalog that was just validated.
 *
 * These two move on their own: the daily sync adds and retires models without
 * anyone editing the README, so a hand-written count is wrong the first morning
 * a provider ships something. Three separate numbers in this repository had
 * already gone stale that way — the test total, the bundle size, and these.
 * The script that knows the real figure is the only thing that can hold a
 * README to it.
 */
const primary = catalog.models.filter((model) => model.aliasOf === undefined).length;
const readme = await readFile(resolve(ROOT, 'README.md'), 'utf8');

const badges: [label: string, pattern: RegExp, actual: number][] = [
  ['models', /badge\/models-(\d+)-/, primary],
  ['providers', /badge\/providers-(\d+)-/, catalog.providers.length],
];

const stale = badges.flatMap(([label, pattern, actual]) => {
  const claimed = pattern.exec(readme)?.[1];
  if (claimed === undefined) return [`the README has no ${label} badge`];
  return Number(claimed) === actual ? [] : [`README says ${claimed} ${label}, the catalog has ${actual}`];
});

if (stale.length > 0) {
  for (const problem of stale) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log(`✓ README badges — ${primary} models, ${catalog.providers.length} providers`);
