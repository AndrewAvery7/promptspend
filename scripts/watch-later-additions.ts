/**
 * Weekly watch on the models and labs the catalog is waiting for.
 *
 *   fetch the price feed -> match data/later-additions.json -> drop what is
 *   already published -> write a report and tell the workflow whether to open,
 *   refresh or close the issue
 *
 * Read-only: it never touches the catalog. The reason it exists is that the
 * rule "wait for the feed rather than hand-add a price nothing can correct" is
 * only a policy if something notices the day the wait is over.
 *
 *   npx tsx scripts/watch-later-additions.ts
 *
 * Writes `later-additions-report.md` and, when running in GitHub Actions,
 * `found=true|false` to $GITHUB_OUTPUT.
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAvailable, renderReport, type WatchItem } from './lib/later-additions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEED_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
/** The real feed carries thousands of rows; a few hundred means truncation. */
const MIN_ENTRIES = 500;

async function main(): Promise<void> {
  const watch = JSON.parse(await readFile(resolve(ROOT, 'data/later-additions.json'), 'utf8')) as {
    items: WatchItem[];
  };
  const catalog = JSON.parse(await readFile(resolve(ROOT, 'public/data/pricing.json'), 'utf8')) as {
    models: { id: string }[];
  };
  const publishedIds = new Set(catalog.models.map((model) => model.id));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let feed: Record<string, unknown>;
  try {
    const response = await fetch(FEED_URL, {
      headers: { 'user-agent': 'promptspend-watch', accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`feed responded ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_PAYLOAD_BYTES) throw new Error(`feed is ${text.length} bytes, over the limit`);
    feed = JSON.parse(text) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
  if (typeof feed !== 'object' || feed === null || Object.keys(feed).length < MIN_ENTRIES) {
    throw new Error('the feed looks truncated; refusing to report from it');
  }

  const found = findAvailable(feed, watch.items, publishedIds);
  const report = renderReport(found, new Date().toISOString().slice(0, 10));
  await writeFile(resolve(ROOT, 'later-additions-report.md'), report);

  console.log(`watching ${watch.items.length} item(s); ${found.length} now in the feed`);
  for (const { item, rows } of found)
    console.log(`  ${item.label}: ${rows.map((row) => row.key).join(', ')}`);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `found=${found.length > 0}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
