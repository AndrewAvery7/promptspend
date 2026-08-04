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

/**
 * Exported for the tests, which is the point.
 *
 * Every case in tools.test.ts hands the engine a catalog it built itself, so
 * this function — the one line of the server that has to work on a stranger's
 * machine, over a real network, against a real server — was the only part
 * nothing ever executed. The failure below lived precisely there.
 */
export { defaultFetch as fetchCatalog };

/**
 * How many times a fetch is attempted before the catalog is called unreachable.
 *
 * Two, because the failure that prompted this did not reproduce. On 2026-08-03
 * the catalog URL returned the site's own HTML once; roughly eighteen fetches
 * immediately afterwards — from Node, from the editor's own runtime, and from
 * curl — all returned the catalog. **The cause was never established.** A deploy
 * in flight and a CDN edge without the file yet are both plausible and neither
 * was confirmed, so nothing here claims either.
 *
 * What is known is the shape of the failure: one bad response turned into a
 * tool call that returned no prices at all. Retrying once is a response to that
 * fact rather than to a diagnosis.
 *
 * This is not caching by another name. Nothing stale is being served; one
 * request is simply being given a second chance before the answer becomes "the
 * catalog is unreachable". The no-bundled-fallback rule at the top of this file
 * is untouched.
 */
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

const fetchOnce = async (url: string): Promise<PricingCatalog> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

  // Checked before parsing so the error reports what arrived. Letting
  // `response.json()` fail produces `Unexpected token '<'`, which is true and
  // tells nobody that the server sent a web page where a catalog should be —
  // and in an agent context that bare syntax error is what the model relays.
  //
  // The message states the status, the type and the first bytes, and stops
  // there. Naming a cause it cannot know is the mistake that produced this
  // whole episode; an error that reports only what it saw is one the next
  // reader can diagnose from.
  const contentType = response.headers.get('content-type') ?? '(none)';
  if (!contentType.includes('json')) {
    const preview = (await response.text()).slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(
      `Expected JSON from ${url} but got HTTP ${response.status} ` +
        `with content-type "${contentType}". Body began: ${preview}`,
    );
  }

  const body: unknown = await response.json();
  // Runtime validation, not a cast. A truncated or reshaped response should fail
  // here rather than become `undefined` inside a price a few frames later.
  assertCatalog(body);
  return body;
};

const defaultFetch: CatalogFetch = async (url) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (cause) {
      lastError = cause;
      if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError;
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
