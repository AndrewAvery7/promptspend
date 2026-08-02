/**
 * Daily pricing sync.
 *
 *   fetch sources -> filter by allowlist -> merge by trust ladder ->
 *   validate -> diff against what is published -> write + changelog
 *
 * Run by .github/workflows/sync-pricing.yml every morning. A clean diff is
 * committed straight to main; anything flagged for review is raised as a pull
 * request instead, so a human sees it before visitors do.
 *
 *   npm run sync:pricing            # write changes
 *   npm run sync:pricing:dry        # report only
 *   tsx scripts/sync-pricing.ts --litellm-file ./fixture.json   # offline
 */
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PricingCatalog } from '../src/lib/pricing/types';
import { validateCatalog } from '../src/lib/pricing/types';
import { fromLiteLLM, fromOpenRouter, type Allowlist, type Override } from './lib/normalize';
import { mergeCatalog } from './lib/merge';
import { diffCatalogs, renderChangelogEntry, summarizeDiff } from './lib/diff';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');
const CHANGELOG_PATH = resolve(ROOT, 'docs/pricing-changelog.md');
const ALLOWLIST_PATH = resolve(ROOT, 'data/models-allowlist.json');
const OVERRIDES_PATH = resolve(ROOT, 'data/pricing-overrides.json');

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

interface Args {
  dryRun: boolean;
  litellmFile?: string;
  skipOpenRouter: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, skipOpenRouter: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-openrouter') args.skipOpenRouter = true;
    else if (arg === '--litellm-file') args.litellmFile = argv[++i];
  }
  return args;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'user-agent': 'token-tally-sync' } });
  if (!response.ok) throw new Error(`${label} responded ${response.status}`);
  return response.json();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();

  const allowlist = (await readJson<Allowlist>(ALLOWLIST_PATH))!;
  const overrides = (await readJson<{ models: Override[] }>(OVERRIDES_PATH))?.models ?? [];
  const previous = await readJson<PricingCatalog>(CATALOG_PATH);

  console.log('→ fetching sources');
  const litellmRaw = args.litellmFile
    ? JSON.parse(await readFile(args.litellmFile, 'utf8'))
    : await fetchJson(LITELLM_URL, 'LiteLLM');
  console.log(`  LiteLLM: ${Object.keys(litellmRaw as object).length} entries`);

  let openrouterRaw: unknown = { data: [] };
  if (!args.skipOpenRouter) {
    try {
      openrouterRaw = await fetchJson(OPENROUTER_URL, 'OpenRouter');
    } catch (error) {
      // The cross-check is a nice-to-have: losing it costs us a warning, not a run.
      console.warn(`  ! OpenRouter unavailable (${(error as Error).message}) — skipping cross-check`);
    }
  }

  const litellm = fromLiteLLM(litellmRaw as Record<string, unknown>, allowlist);
  const openrouter = fromOpenRouter(openrouterRaw);
  console.log(`  matched ${litellm.length} models across ${allowlist.families.length} families`);
  console.log(`  OpenRouter cross-check pool: ${openrouter.size}`);

  const { catalog, review } = mergeCatalog({
    litellm,
    openrouter,
    allowlist,
    overrides,
    previous,
    generatedAt,
  });

  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    console.error('\n✗ Refusing to publish — the merged catalog failed validation:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  const diff = diffCatalogs(previous, catalog);
  const summary = summarizeDiff(diff);
  console.log(`\n→ ${catalog.models.length} models, ${catalog.providers.length} providers`);
  console.log(`→ diff: ${summary}`);
  for (const item of diff.added) console.log(`   + ${item.id} ($${item.input}/$${item.output})`);
  for (const item of diff.changed) {
    console.log(`   ~ ${item.id} ${item.field}: $${item.from} → $${item.to}`);
  }
  for (const item of diff.removed) console.log(`   - ${item.id}`);

  if (review.length > 0) {
    console.log(`\n⚠ ${review.length} model(s) need human review before publishing:`);
    for (const item of review) console.log(`   ${item.id}: ${item.reason}`);
  }

  if (args.dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }

  await mkdir(dirname(CATALOG_PATH), { recursive: true });
  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  if (!diff.isEmpty) {
    const date = generatedAt.toISOString().slice(0, 10);
    const entry = renderChangelogEntry(date, diff);
    if (existsSync(CHANGELOG_PATH)) {
      await appendFile(CHANGELOG_PATH, `\n${entry}`, 'utf8');
    } else {
      await mkdir(dirname(CHANGELOG_PATH), { recursive: true });
      await writeFile(
        CHANGELOG_PATH,
        `# Pricing changelog\n\nEvery change the daily sync has published, newest last.\n\n${entry}`,
        'utf8',
      );
    }
  }

  // Surface results to the workflow so it can decide commit-vs-pull-request.
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const lines = [
      `changed=${diff.isEmpty ? 'false' : 'true'}`,
      `needs_review=${review.length > 0 ? 'true' : 'false'}`,
      `summary=${summary}`,
      `model_count=${catalog.models.length}`,
    ];
    await appendFile(githubOutput, `${lines.join('\n')}\n`, 'utf8');
  }

  console.log(`\n✓ wrote ${CATALOG_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
