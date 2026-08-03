/**
 * Tell IndexNow that specific pages changed, the moment they actually change.
 *
 * Runs alongside `notify-alerts.ts`, on a push to `main` that moved
 * `public/data/pricing.json`, and submits exactly the pages that a reader would
 * see differently: the model pages for the models whose rates moved, every
 * comparison page one of them appears on, and the two index tables that list
 * them.
 *
 *   npx tsx scripts/ping-indexnow.ts [--dry-run]
 *
 * Environment:
 *   SITE_URL   absolute origin of the live site, e.g. https://promptspend.com
 *
 * **Bing, Yandex, Seznam and Naver read this. Google does not** — it has never
 * joined IndexNow and finds these pages through the sitemap and ordinary
 * crawling. Saying so plainly matters, because "we notify search engines when
 * prices change" sounds like it includes the one that matters most.
 *
 * Submitting the whole sitemap on every change would be simpler and is exactly
 * what gets a host's submissions ignored: the protocol is for pages that
 * genuinely changed, and crying wolf on 160 URLs a day is how you teach a
 * crawler to stop listening.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildOutboundChanges } from './lib/notify';
import { submitUrls } from './lib/indexnow';
import { buildPages } from '@/lib/seo/pages';
import type { PricingCatalog } from '@/lib/pricing/types';

const CATALOG_PATH = 'public/data/pricing.json';
const DRY_RUN = process.argv.includes('--dry-run');

function readAtRevision(revision: string, path: string): PricingCatalog | undefined {
  try {
    const raw = execFileSync('git', ['show', `${revision}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(raw) as PricingCatalog;
  } catch {
    return undefined;
  }
}

/** Every page whose visible content depends on one of these models. */
export function affectedPaths(catalog: PricingCatalog, changedIds: readonly string[]): string[] {
  const set = buildPages(catalog, { asOf: new Date(catalog.generatedAt) });
  const changed = new Set(changedIds);
  const paths = new Set<string>();

  for (const page of set.models) {
    if (changed.has(page.id)) paths.add(page.path);
  }
  for (const page of set.comparisons) {
    if (changed.has(page.left.id) || changed.has(page.right.id)) paths.add(page.path);
  }
  for (const page of set.providers) {
    if (page.models.some((entry) => changed.has(entry.model.id))) paths.add(page.path);
  }
  // The index tables carry a price column, so they moved too — as did the
  // calculator, whose ticker reads the same numbers.
  paths.add(set.modelsIndex.path);
  paths.add('/');

  return [...paths].sort();
}

async function main(): Promise<void> {
  const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  const next = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as PricingCatalog;
  const previous = readAtRevision('HEAD~1', CATALOG_PATH);

  const changes = buildOutboundChanges(previous, next);
  if (changes.length === 0) {
    console.log('No user-visible price changes in this commit — nothing to submit.');
    return;
  }

  if (!siteUrl) {
    console.log('SITE_URL is not set — skipping IndexNow.');
    console.log('That is the expected state for a build that is not the live site.');
    return;
  }

  const host = new URL(siteUrl).host;
  // The host itself or something below it — `endsWith` alone would also match
  // `notgithub.io`, a domain someone else owns.
  if (host === 'github.io' || host.endsWith('.github.io')) {
    // The protocol proves control of a host by serving a key file at its root.
    // We do not control github.io, so a submission for it would be refused —
    // correctly.
    console.log(`SITE_URL is ${siteUrl}; IndexNow only applies to a domain we control. Skipping.`);
    return;
  }

  const paths = affectedPaths(
    next,
    changes.map((change) => change.modelId),
  );
  const urls = paths.map((path) => `${siteUrl}${path}`);

  console.log(`${changes.length} changed model(s) touch ${urls.length} page(s):`);
  for (const url of urls.slice(0, 10)) console.log(`  ${url}`);
  if (urls.length > 10) console.log(`  … and ${urls.length - 10} more`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing submitted.');
    return;
  }

  const result = await submitUrls(host, urls);
  if (result.status >= 400) {
    // A warning, not a failure. IndexNow is an optimisation on top of ordinary
    // crawling — failing the build over it would mean a rejected submission
    // blocked a deploy that was otherwise perfect.
    console.log(`::warning::IndexNow returned HTTP ${result.status}: ${result.body}`);
    return;
  }
  console.log(`Submitted ${result.submitted} URL(s) — HTTP ${result.status}.`);
}

// Only when run directly. `affectedPaths` is exported and imported elsewhere,
// and a module that submits to a search engine as a side effect of being
// imported is a trap waiting for whoever writes the next test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((cause: unknown) => {
    console.log(`::warning::IndexNow submission failed: ${cause instanceof Error ? cause.message : cause}`);
  });
}
