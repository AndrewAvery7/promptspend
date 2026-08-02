/**
 * Reading the pricing catalog, once per five minutes per edge location.
 *
 * The catalog is a static file on the site rather than something bundled into
 * this Worker. That is the whole design decision, so it is worth stating why:
 *
 * - **Bundled** would be faster and would mean this API is only as fresh as its
 *   last deploy. The prices change on a daily cron that has nothing to do with
 *   this Worker, so a bundled copy would need a deploy every morning to stay
 *   true — and the failure mode of forgetting is an API confidently serving
 *   last week's numbers.
 * - **Fetched** costs one origin request per edge per five minutes and is
 *   always exactly as current as the site.
 *
 * There is deliberately **no bundled fallback**. A snapshot baked in at deploy
 * time could be months old, and "here are some prices, they might be from
 * March" is worse than an honest 503. What there *is* instead: a cached copy
 * kept for a day, served with an explicit staleness header if the origin cannot
 * be reached. Stale-but-dated beats absent; stale-and-undated does not.
 */

import { validateCatalog, type Model, type PricingCatalog } from '../../src/lib/pricing/types';
import type { Env } from './env';

/** How long a cached copy is retained, as opposed to how long it stays fresh. */
const CACHE_SECONDS = 86_400;

/** Header carrying the moment the cached body was fetched from the origin. */
const FETCHED_AT = 'X-PromptSpend-Fetched-At';

export interface CatalogRead {
  catalog: PricingCatalog;
  /** When this copy was pulled from the site. */
  fetchedAt: Date;
  /** True when the origin was unreachable and a retained copy was served. */
  stale: boolean;
}

/** Zero is a legitimate setting — "revalidate on every request" — so the guard
 *  is `>= 0`, not `> 0`. It is also what makes the stale path testable. */
function freshSeconds(env: Env): number {
  const parsed = Number(env.FRESH_SECONDS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
}

/**
 * The catalog, from the edge cache when it is fresh enough.
 *
 * `caches.default` is per-colo, so a busy location revalidates every five
 * minutes and a quiet one may go longer between origin hits — which is exactly
 * the behaviour wanted from a file that changes once a day.
 */
export async function readCatalog(env: Env, ctx?: ExecutionContext): Promise<CatalogRead> {
  const key = new Request(env.CATALOG_URL, { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(key);

  if (cached) {
    const fetchedAt = new Date(cached.headers.get(FETCHED_AT) ?? 0);
    const age = (Date.now() - fetchedAt.getTime()) / 1000;
    if (age < freshSeconds(env)) {
      return { catalog: (await cached.json()) as PricingCatalog, fetchedAt, stale: false };
    }

    // Past its freshness window. Try the origin; if that fails, the retained
    // copy is still the best answer available, labelled as such.
    try {
      return await fetchAndStore(env, key, cache, ctx);
    } catch {
      return { catalog: (await cached.json()) as PricingCatalog, fetchedAt, stale: true };
    }
  }

  return fetchAndStore(env, key, cache, ctx);
}

async function fetchAndStore(
  env: Env,
  key: Request,
  cache: Cache,
  ctx?: ExecutionContext,
): Promise<CatalogRead> {
  const response = await fetch(env.CATALOG_URL, { cf: { cacheTtl: 60 } });
  if (!response.ok) {
    throw new Error(`catalog origin returned HTTP ${response.status}`);
  }

  const body = await response.text();
  const parsed: unknown = JSON.parse(body);
  // The same rules the site enforces at load. An API that will serve anything
  // its upstream hands it has no more integrity than that upstream.
  const errors = validateCatalog(parsed);
  if (errors.length > 0) {
    throw new Error(`catalog failed validation: ${errors.slice(0, 3).join('; ')}`);
  }

  const fetchedAt = new Date();
  const store = new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      [FETCHED_AT]: fetchedAt.toISOString(),
    },
  });
  const put = cache.put(key, store);
  if (ctx) ctx.waitUntil(put);
  else await put;

  return { catalog: parsed as PricingCatalog, fetchedAt, stale: false };
}

// ------------------------------------------------------------- projections

/** The flat shape most callers want: one row, one model, only numbers. */
export interface PriceRow {
  id: string;
  provider: string;
  displayName: string;
  input: number;
  output: number;
  cachedInput: number | null;
  cacheWrite: number | null;
  contextWindow: number;
  maxOutput: number | null;
  status: string;
  lastVerified: string;
}

export function priceRows(catalog: PricingCatalog): PriceRow[] {
  return catalog.models.map((model) => ({
    id: model.id,
    provider: model.providerId,
    displayName: model.displayName,
    input: model.pricing.input,
    output: model.pricing.output,
    cachedInput: model.pricing.cachedInput ?? null,
    cacheWrite: model.pricing.cacheWrite ?? null,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput ?? null,
    status: model.status,
    lastVerified: model.provenance.lastVerified,
  }));
}

const CSV_COLUMNS: (keyof PriceRow)[] = [
  'id',
  'provider',
  'displayName',
  'input',
  'output',
  'cachedInput',
  'cacheWrite',
  'contextWindow',
  'maxOutput',
  'status',
  'lastVerified',
];

/** RFC 4180: quote anything containing a comma, quote or newline; double the quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function priceCsv(catalog: PricingCatalog): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of priceRows(catalog)) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export interface ModelFilter {
  provider?: string | undefined;
  status?: string | undefined;
  /** Exclude routing aliases, which are the same product under another id. */
  primaryOnly: boolean;
}

export function filterModels(catalog: PricingCatalog, filter: ModelFilter): Model[] {
  return catalog.models.filter((model) => {
    if (filter.primaryOnly && model.aliasOf !== undefined) return false;
    if (filter.provider && model.providerId !== filter.provider) return false;
    if (filter.status && model.status !== filter.status) return false;
    return true;
  });
}
