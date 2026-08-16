/**
 * Daily pricing sync.
 *
 *   fetch sources -> filter by allowlist -> merge by trust ladder ->
 *   validate -> diff against what is published -> write + changelog + health
 *
 * Run by .github/workflows/sync-pricing.yml every morning.
 *
 * The pipeline treats both upstream feeds as untrusted input, because that is
 * what they are: files on someone else's server that this project publishes as
 * fact. Every fetch is bounded in time and size, the payload's shape is checked
 * before it is believed, and a run that loses a source or sees the catalog
 * shrink unexpectedly is marked *degraded* — it writes the health manifest so
 * the failure is visible, and refuses to touch the catalog.
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
import { HEALTH_SCHEMA_VERSION, type SourceReport, type SyncStatus } from '../src/lib/pricing/health';
import { fromLiteLLM, fromOpenRouter, type Allowlist, type Override } from './lib/normalize';
import { mergeCatalog } from './lib/merge';
import { catalogHash, diffCatalogs, renderChangelogEntry, summarizeDiff } from './lib/diff';
import { updateCatalogBadges } from './lib/readme-badges';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');
const STATUS_PATH = resolve(ROOT, 'public/data/sync-status.json');
const CHANGELOG_PATH = resolve(ROOT, 'docs/pricing-changelog.md');
const README_PATH = resolve(ROOT, 'README.md');
const ALLOWLIST_PATH = resolve(ROOT, 'data/models-allowlist.json');
const OVERRIDES_PATH = resolve(ROOT, 'data/pricing-overrides.json');

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

/** Guard rails. Every one of these exists to stop a bad fetch reaching users. */
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_RETRIES = 2;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
/** The real LiteLLM catalog carries thousands of rows; a few hundred means truncation. */
const MIN_LITELLM_ENTRIES = 500;
/** Fraction of the published catalog that may disappear in one run before we stop. */
const MAX_CATALOG_SHRINK = 0.1;

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

interface FetchResult {
  body: unknown;
  /** ETag where the host provides one. On raw.githubusercontent this is the
   *  blob SHA, which makes it a genuine content-addressed revision. */
  revision?: string;
  bytes: number;
}

/**
 * A fetch that cannot hang, cannot blow up memory, and does not accept an
 * error page as data. Retries transient failures with a short backoff.
 */
async function fetchJson(url: string, label: string): Promise<FetchResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    if (attempt > 0) await delay(500 * 2 ** (attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'promptspend-sync', accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${label} responded ${response.status}`);

      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > MAX_PAYLOAD_BYTES) {
        throw new Error(`${label} payload is ${declared} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);
      }
      const text = await response.text();
      if (text.length > MAX_PAYLOAD_BYTES) {
        throw new Error(`${label} payload is ${text.length} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        // An HTML error page parses as neither JSON nor pricing data. Say so
        // rather than letting `undefined` flow into the merge.
        throw new Error(`${label} did not return JSON (${text.slice(0, 60).replace(/\s+/g, ' ')}…)`);
      }
      if (typeof body !== 'object' || body === null) {
        throw new Error(`${label} returned ${typeof body}, expected an object`);
      }

      return {
        body,
        ...(response.headers.get('etag')
          ? { revision: response.headers.get('etag')!.replace(/"/g, '') }
          : {}),
        bytes: text.length,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`${label} failed`);
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();
  const problems: string[] = [];
  const sources: SourceReport[] = [];

  const allowlist = (await readJson<Allowlist>(ALLOWLIST_PATH))!;
  const overrides = (await readJson<{ models: Override[] }>(OVERRIDES_PATH))?.models ?? [];
  const previous = await readJson<PricingCatalog>(CATALOG_PATH);
  const previousStatus = await readJson<SyncStatus>(STATUS_PATH);

  console.log('→ fetching sources');
  let litellmRaw: Record<string, unknown> = {};
  if (args.litellmFile) {
    litellmRaw = JSON.parse(await readFile(args.litellmFile, 'utf8')) as Record<string, unknown>;
    sources.push({ id: 'litellm', ok: true, entries: Object.keys(litellmRaw).length, note: 'local fixture' });
  } else {
    try {
      const result = await fetchJson(LITELLM_URL, 'LiteLLM');
      litellmRaw = result.body as Record<string, unknown>;
      sources.push({
        id: 'litellm',
        ok: true,
        entries: Object.keys(litellmRaw).length,
        ...(result.revision ? { revision: result.revision } : {}),
      });
    } catch (error) {
      // The primary feed is not optional: without it there is nothing to merge.
      problems.push(`primary source unavailable: ${(error as Error).message}`);
      sources.push({ id: 'litellm', ok: false, note: (error as Error).message });
    }
  }

  const litellmEntries = Object.keys(litellmRaw).length;
  console.log(`  LiteLLM: ${litellmEntries} entries`);
  if (sources[0]?.ok && litellmEntries < MIN_LITELLM_ENTRIES) {
    problems.push(
      `primary source returned only ${litellmEntries} entries (expected at least ${MIN_LITELLM_ENTRIES}) — treating as truncated`,
    );
    sources[0].ok = false;
  }

  let openrouterRaw: unknown = { data: [] };
  if (args.skipOpenRouter) {
    sources.push({ id: 'openrouter', ok: false, note: 'skipped by flag' });
    problems.push('cross-check skipped by flag');
  } else {
    try {
      const result = await fetchJson(OPENROUTER_URL, 'OpenRouter');
      openrouterRaw = result.body;
      const rows = Array.isArray((result.body as { data?: unknown }).data)
        ? ((result.body as { data: unknown[] }).data.length ?? 0)
        : 0;
      if (rows === 0) throw new Error('no models in payload');
      sources.push({ id: 'openrouter', ok: true, entries: rows });
    } catch (error) {
      // Losing the independent cross-check does not stop the run, but it does
      // stop it publishing: an unwitnessed price is exactly what rung 3 exists
      // to catch.
      console.warn(`  ! OpenRouter unavailable (${(error as Error).message})`);
      problems.push(`cross-check unavailable: ${(error as Error).message}`);
      sources.push({ id: 'openrouter', ok: false, note: (error as Error).message });
    }
  }

  const litellm = fromLiteLLM(litellmRaw, allowlist);
  const openrouter = fromOpenRouter(openrouterRaw);
  console.log(`  matched ${litellm.length} models across ${allowlist.families.length} families`);
  console.log(`  OpenRouter cross-check pool: ${openrouter.size}`);

  const { catalog, review, stale, corrections } = mergeCatalog({
    litellm,
    openrouter,
    allowlist,
    overrides,
    previous,
    generatedAt,
  });

  // A model can only leave the catalog through the allowlist's `retired` list,
  // so a shrink here means a deliberate edit — or a mistake in one.
  const previousCount = previous?.models.length ?? 0;
  if (previousCount > 0 && catalog.models.length < previousCount * (1 - MAX_CATALOG_SHRINK)) {
    problems.push(
      `catalog shrank from ${previousCount} to ${catalog.models.length} models — more than ${Math.round(
        MAX_CATALOG_SHRINK * 100,
      )}%`,
    );
  }
  if (stale.length > 0) {
    console.log(`\n⚠ ${stale.length} model(s) missing upstream, kept and marked stale:`);
    for (const id of stale) console.log(`   ${id}`);
  }

  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    console.error('\n✗ Refusing to publish — the merged catalog failed validation:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  const diff = diffCatalogs(previous, catalog);
  const summary = summarizeDiff(diff);
  const newReview = review.filter((item) => item.isNew);
  const degraded = problems.length > 0;

  console.log(`\n→ ${catalog.models.length} models, ${catalog.providers.length} providers`);
  console.log(`→ diff: ${summary}`);
  for (const item of diff.added) console.log(`   + ${item.id} ($${item.input}/$${item.output})`);
  for (const item of diff.changed) {
    console.log(`   ~ ${item.id} ${item.field}: ${String(item.from)} → ${String(item.to)}`);
  }
  for (const item of diff.metadata) console.log(`   · ${item.id} ${item.field}`);
  for (const item of diff.reviewState) console.log(`   ⚑ ${item.id} ${item.field}`);
  for (const item of diff.removed) console.log(`   - ${item.id}`);

  if (corrections.length > 0) {
    console.log(`\n↻ ${corrections.length} rate(s) restated by a source change — lastChanged left alone:`);
    for (const item of corrections) {
      console.log(`   ${item.id}: ${item.from ?? '—'} → ${item.to ?? '—'}`);
    }
  }

  if (review.length > 0) {
    console.log(`\n⚠ ${review.length} flag(s), ${newReview.length} new since the published catalog:`);
    for (const item of review) console.log(`   ${item.isNew ? 'NEW ' : '    '}${item.id}: ${item.reason}`);
  }
  if (degraded) {
    console.error('\n✗ Degraded run — the catalog will not be updated:');
    for (const problem of problems) console.error(`  - ${problem}`);
  }

  // A degraded run publishes only the health manifest. Every catalog-derived
  // field in that manifest must therefore describe the catalog that remains
  // public, not the rejected candidate produced by this attempt.
  const publishedCatalog = degraded && previous ? previous : catalog;
  const flaggedCount = publishedCatalog.models.filter((m) => m.provenance.needsReview).length;
  const pricesLastChanged = publishedCatalog.models
    .map((m) => m.provenance.lastChanged)
    .filter((d): d is string => typeof d === 'string')
    .sort()
    .at(-1);

  const status: SyncStatus = {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    attemptedAt: generatedAt.toISOString(),
    succeededAt: degraded ? (previousStatus?.succeededAt ?? null) : generatedAt.toISOString(),
    outcome: degraded ? 'degraded' : 'ok',
    problems,
    sources,
    modelCount: publishedCatalog.models.length,
    flaggedCount,
    staleCount: publishedCatalog.models.filter((m) => m.provenance.stale).length,
    catalogHash: catalogHash(publishedCatalog),
    pricesLastChanged: pricesLastChanged ?? null,
  };

  if (args.dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }

  await mkdir(dirname(STATUS_PATH), { recursive: true });
  await writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`, 'utf8');

  if (!degraded) {
    await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

    const readme = await readFile(README_PATH, 'utf8');
    const primaryModels = catalog.models.filter((model) => model.aliasOf === undefined).length;
    const updatedReadme = updateCatalogBadges(readme, {
      models: primaryModels,
      providers: catalog.providers.length,
    });
    if (updatedReadme !== readme) await writeFile(README_PATH, updatedReadme, 'utf8');

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
  }

  // Surface results to the workflow so it can decide commit-vs-pull-request.
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const lines = [
      `changed=${!degraded && !diff.isEmpty ? 'true' : 'false'}`,
      `price_changed=${!degraded && diff.hasPriceChange ? 'true' : 'false'}`,
      `needs_review=${newReview.length > 0 ? 'true' : 'false'}`,
      `degraded=${degraded ? 'true' : 'false'}`,
      `summary=${summary}`,
      `model_count=${catalog.models.length}`,
      `flagged_count=${flaggedCount}`,
    ];
    await appendFile(githubOutput, `${lines.join('\n')}\n`, 'utf8');
  }

  console.log(degraded ? `\n⚠ wrote ${STATUS_PATH} only` : `\n✓ wrote ${CATALOG_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
