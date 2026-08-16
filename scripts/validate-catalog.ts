/**
 * Guard rail for CI: the published catalog must always satisfy the schema the
 * app expects, including after a hand-edit or a merged pull request.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, type PricingCatalog } from '../src/lib/pricing/types';
import type { SyncStatus } from '../src/lib/pricing/health';
import { catalogHash } from './lib/diff';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');
const STATUS_PATH = resolve(ROOT, 'public/data/sync-status.json');

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as PricingCatalog;
const errors = validateCatalog(catalog);

if (errors.length > 0) {
  console.error(`✗ ${CATALOG_PATH} is invalid:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

/**
 * A price cannot change on a day nobody checked it.
 *
 * `lastVerified` is the day we last read the vendor's own page; `lastChanged`
 * is the day the published rate moved. A row where the second is later than
 * the first is not a judgement call about freshness — it is a contradiction,
 * and it says the number moved after the last time anyone looked at it.
 *
 * Twelve rows shipped in exactly that state, because nothing here was checking.
 * The schema validator cannot catch it: both fields are individually valid
 * dates, and only their relationship is impossible.
 */
const contradictory = catalog.models
  .filter((model) => {
    const { lastChanged, lastVerified } = model.provenance;
    return lastChanged !== undefined && lastChanged > lastVerified;
  })
  .map(
    (model) =>
      `${model.id}: changed ${model.provenance.lastChanged} but last verified ${model.provenance.lastVerified}`,
  );

if (contradictory.length > 0) {
  console.error(`✗ ${contradictory.length} model(s) claim a price change after the last verification:`);
  for (const problem of contradictory) console.error(`  - ${problem}`);
  process.exit(1);
}

/** The catalog and health manifest are a public pair. Validate their shared
 * fields together so a manual edit, interrupted workflow or future refactor
 * cannot leave consumers reading health claims about different bytes. */
const status = JSON.parse(await readFile(STATUS_PATH, 'utf8')) as SyncStatus;
const expectedStatus = {
  modelCount: catalog.models.length,
  flaggedCount: catalog.models.filter((model) => model.provenance.needsReview).length,
  staleCount: catalog.models.filter((model) => model.provenance.stale).length,
  catalogHash: catalogHash(catalog),
  pricesLastChanged:
    catalog.models
      .map((model) => model.provenance.lastChanged)
      .filter((date): date is string => typeof date === 'string')
      .sort()
      .at(-1) ?? null,
};
const statusMismatches = (Object.keys(expectedStatus) as Array<keyof typeof expectedStatus>).flatMap(
  (field) =>
    status[field] === expectedStatus[field]
      ? []
      : [
          `sync-status.${field} is ${String(status[field])}; catalog requires ${String(expectedStatus[field])}`,
        ],
);
if (status.succeededAt !== catalog.generatedAt) {
  statusMismatches.push(
    `sync-status.succeededAt is ${String(status.succeededAt)}; catalog generatedAt is ${catalog.generatedAt}`,
  );
}
if (statusMismatches.length > 0) {
  console.error('✗ public/data/sync-status.json does not describe public/data/pricing.json:');
  for (const problem of statusMismatches) console.error(`  - ${problem}`);
  process.exit(1);
}

const flagged = catalog.models.filter((model) => model.provenance.needsReview).length;
console.log(
  `✓ catalog valid — ${catalog.models.length} models, ${catalog.providers.length} providers, ` +
    `${flagged} flagged for review, generated ${catalog.generatedAt}`,
);
console.log('✓ sync status describes the exact published catalog');

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
