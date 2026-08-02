/**
 * Tell the alerts worker that published prices moved.
 *
 * Runs on a push to `main` that changed `public/data/pricing.json`, which is
 * the moment the site actually starts showing new numbers. Triggering off the
 * sync job instead would have notified people about prices that were still
 * sitting in an unmerged pull request, and would have missed the changes a
 * human reviewed and merged by hand.
 *
 *   npx tsx scripts/notify-alerts.ts [--dry-run]
 *
 * Environment:
 *   ALERTS_API      origin of the worker, e.g. https://alerts.promptspend.dev
 *   NOTIFY_SECRET   shared HMAC secret, the same value the worker holds
 *
 * With either unset the script explains itself and exits 0. A repository that
 * has not wired up alerts yet should not have a red build every morning.
 */

import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { catalogHash } from './lib/diff';
import { buildOutboundChanges } from './lib/notify';
import type { PricingCatalog } from '../src/lib/pricing/types';

const CATALOG_PATH = 'public/data/pricing.json';
const DRY_RUN = process.argv.includes('--dry-run');

/** Read a file at a git revision, or undefined if it was not there. */
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

async function main(): Promise<void> {
  const api = (process.env.ALERTS_API ?? '').replace(/\/+$/, '');
  const secret = process.env.NOTIFY_SECRET ?? '';

  const next = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as PricingCatalog;
  const previous = readAtRevision('HEAD~1', CATALOG_PATH);

  const changes = buildOutboundChanges(previous, next);
  if (changes.length === 0) {
    console.log('No user-visible price changes in this commit — nothing to notify.');
    return;
  }

  const payload = {
    // Deterministic in the catalog contents. A re-run of this job, or a revert
    // and re-apply, produces the same id, and the worker treats a repeat as a
    // no-op rather than a second round of notifications.
    eventId: `catalog-${catalogHash(next)}`,
    generatedAt: next.generatedAt,
    changes,
  };

  console.log(`${changes.length} change(s) to notify:`);
  for (const change of changes) console.log(`  - ${change.kind}: ${change.displayName}`);

  if (!api || !secret) {
    console.log('\nALERTS_API or NOTIFY_SECRET is not set — skipping delivery.');
    console.log('This is the expected state until the alerts worker has a domain.');
    return;
  }
  if (DRY_RUN) {
    console.log(`\n--dry-run: would POST to ${api}/v1/notify`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  const response = await fetch(`${api}/v1/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PromptSpend-Timestamp': timestamp,
      'X-PromptSpend-Signature': `v1=${signature}`,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    // Loud, and a failed job. A silent notify failure means subscribers stop
    // hearing from us and nobody finds out until one of them complains.
    console.error(`::error::Notify failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`Notified: ${text}`);
}

main().catch((cause: unknown) => {
  console.error(`::error::${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
});
