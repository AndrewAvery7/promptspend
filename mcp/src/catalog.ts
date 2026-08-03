/**
 * The catalog the tools price against.
 *
 * Fetched from the published file rather than bundled, for the same reason the
 * API fetches it: bundling would mean the server is only as current as the last
 * npm publish, and the failure mode of forgetting to publish is a pricing tool
 * confidently quoting last month's numbers. That is the exact failure this
 * project exists to prevent, so it must not be reintroduced here.
 *
 * There is deliberately no bundled fallback. If the catalog cannot be reached,
 * the tools say so. A months-old snapshot presented as current is worse than an
 * honest failure — and in an agent context it is worse still, because the model
 * will relay it to the user with full confidence.
 */
import { Catalog } from '@/lib/pricing/catalog';
import { assertCatalog, type PricingCatalog } from '@/lib/pricing/types';

export const CATALOG_URL = 'https://promptspend.com/data/pricing.json';

/** How long a fetched catalog is reused before being re-fetched. */
const FRESH_MS = 5 * 60 * 1000;

interface Cached {
  catalog: Catalog;
  generatedAt: string;
  fetchedAt: number;
}

let cached: Cached | null = null;

export class CatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      `Could not reach the PromptSpend catalog at ${CATALOG_URL}. ` +
        `No prices are being returned rather than stale ones. (${String(cause)})`,
    );
    this.name = 'CatalogUnavailableError';
  }
}

export interface CatalogFetch {
  (url: string): Promise<PricingCatalog>;
}

const defaultFetch: CatalogFetch = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body: unknown = await response.json();
  assertCatalog(body);
  return body;
};

/** Reset between tests; also the escape hatch if a host keeps the process alive for days. */
export function clearCatalogCache(): void {
  cached = null;
}

export async function getCatalog(
  now: number = Date.now(),
  fetcher: CatalogFetch = defaultFetch,
): Promise<Cached> {
  if (cached && now - cached.fetchedAt < FRESH_MS) return cached;
  try {
    const raw = await fetcher(CATALOG_URL);
    cached = {
      catalog: new Catalog(raw),
      generatedAt: raw.generatedAt,
      fetchedAt: now,
    };
    return cached;
  } catch (cause) {
    // A previously fetched catalog is better than nothing ONLY while it is
    // plausibly current; past that the honest answer is failure.
    if (cached && now - cached.fetchedAt < 24 * 60 * 60 * 1000) return cached;
    throw new CatalogUnavailableError(cause);
  }
}
