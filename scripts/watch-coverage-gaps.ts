/**
 * Weekly coverage-gap check.
 *
 *   fetch another tracker's model list, the price feed and the published
 *   catalog -> find first-party feed rows no capture rule picks up -> write a
 *   report and tell the workflow whether to open, refresh or close the issue
 *
 * Read-only: it never touches the catalog. The other tracker's list supplies
 * names only; see scripts/lib/coverage-gaps.ts for why its prices are not used.
 *
 *   npx tsx scripts/watch-coverage-gaps.ts
 *
 * Writes `coverage-gaps-report.md` and, when running in GitHub Actions,
 * `found=true|false` to $GITHUB_OUTPUT.
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCoverageGaps, renderGapReport, type HintModel, type IgnoreRule } from './lib/coverage-gaps';
import type { Allowlist } from './lib/normalize';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEED_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
/** Model Price Watch's public list (CC BY 4.0). Names only are used. */
const HINT_URL = 'https://modelpricewatch.com/api/v1/models.json';
const HINT_SOURCE = 'https://modelpricewatch.com';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
/** The real feed carries thousands of rows and the hint list hundreds; far fewer means truncation. */
const MIN_FEED_ENTRIES = 500;
const MIN_HINTS = 50;

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'promptspend-watch', accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_PAYLOAD_BYTES) throw new Error(`${url} is ${text.length} bytes, over the limit`);
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8')) as T;
}

async function main(): Promise<void> {
  const allowlist = await readJson<Allowlist>('data/models-allowlist.json');
  const ignore = (await readJson<{ items: IgnoreRule[] }>('data/coverage-ignore.json')).items;
  const catalog = await readJson<{ models: { id: string; displayName: string }[] }>(
    'public/data/pricing.json',
  );

  const feed = (await getJson(FEED_URL)) as Record<string, unknown>;
  if (typeof feed !== 'object' || feed === null || Object.keys(feed).length < MIN_FEED_ENTRIES) {
    throw new Error('the feed looks truncated; refusing to report from it');
  }
  const hintBody = (await getJson(HINT_URL)) as { data?: unknown };
  const hints = Array.isArray(hintBody?.data) ? (hintBody.data as HintModel[]) : [];
  if (hints.length < MIN_HINTS)
    throw new Error(`the hint list has ${hints.length} rows; refusing to report from it`);

  const gaps = findCoverageGaps({ hints, feed, allowlist, published: catalog.models, ignore });
  await writeFile(
    resolve(ROOT, 'coverage-gaps-report.md'),
    renderGapReport(gaps, new Date().toISOString().slice(0, 10), HINT_SOURCE),
  );

  console.log(`compared ${hints.length} listed models; ${gaps.length} uncaptured first-party feed row(s)`);
  for (const gap of gaps) console.log(`  ${gap.key}: $${gap.inputPerMillion} / $${gap.outputPerMillion}`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `found=${gaps.length > 0}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
