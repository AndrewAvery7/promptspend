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
