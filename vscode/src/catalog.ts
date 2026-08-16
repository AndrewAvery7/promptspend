/**
 * The catalog the editor prices against.
 *
 * Fetched from the published file, with **no bundled fallback** — the same rule
 * `mcp/src/catalog.ts` sets out, for the same reason: a months-old snapshot
 * presented as current is worse than an honest failure, and this project exists
 * to prevent exactly that. A `.vsix` sitting in the Marketplace for three months
 * with prices baked into it would be the purest possible version of the problem.
 *
 * Two intervals differ from the MCP server's, on purpose:
 *
 *   - **Six hours, not five minutes.** The MCP server is a short-lived process
 *     answering a handful of calls; an editor stays open for days. The artifact
 *     is regenerated once a day by the sync workflow, so a five-minute window
 *     would mean 288 requests a day per user against a file that changed once.
 *   - The status bar shows `generatedAt` at all times, which the MCP server has
 *     no way to do. Freshness is therefore visible continuously rather than
 *     inferred, which is what makes the longer interval honest rather than lax.
 *
 * Past the grace period the answer is "unavailable", never a number.
 */
import { Catalog } from '@/lib/pricing/catalog';
import { assertCatalog, type PricingCatalog } from '@/lib/pricing/types';

export const CATALOG_URL = 'https://promptspend.com/data/pricing.json';

/** How long a fetched catalog is reused before a refresh is attempted. */
export const FRESH_MS = 6 * 60 * 60 * 1000;

/**
 * How long a cached catalog may keep being used once refreshing has started
 * failing. Past this the extension stops showing prices rather than showing old
 * ones — an offline laptop gets a day of usefulness, not a week of fiction.
 */
export const GRACE_MS = 24 * 60 * 60 * 1000;
/** Do not turn one offline editor into a request storm on every hover/file. */
export const FAILURE_BACKOFF_MS = 60 * 1000;

export interface CatalogReady {
  status: 'ready';
  catalog: Catalog;
  /** ISO timestamp the pipeline stamped on the artifact. */
  generatedAt: string;
  /** True when this copy is being served past `FRESH_MS` because a refresh failed. */
  ageing: boolean;
}

export interface CatalogUnavailable {
  status: 'unavailable';
  /** Human-readable, and shown verbatim — the user should learn what broke. */
  reason: string;
}

export type CatalogState = CatalogReady | CatalogUnavailable;

export interface CatalogFetch {
  (url: string): Promise<PricingCatalog>;
}

/**
 * Exported for the tests, which is the point.
 *
 * Every test in catalog.test.ts injected a fake fetcher, so this function — the
 * one line of the extension that has to work on a stranger's machine, over a real
 * network, against a real server — was the only part never executed by anything.
 * The bug that cost a debugging session lived precisely here.
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
 * What is known is the shape of the failure: one bad response turned into an
 * editor showing no prices at all. Retrying once is a response to that fact
 * rather than to a diagnosis.
 */
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

const fetchOnce = async (url: string): Promise<PricingCatalog> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

  // Checked before parsing so the error reports what arrived. Letting
  // `response.json()` fail produces `Unexpected token '<'`, which is true and
  // tells nobody that the server sent a web page where a catalog should be.
  //
  // The message states observations only — status, content type, the first bytes
  // — and offers no explanation. An error that asserts a cause nobody has
  // confirmed sends the next reader down a road that may not exist.
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

interface Cached {
  catalog: Catalog;
  generatedAt: string;
  fetchedAt: number;
}

/**
 * Holds the catalog for the life of an editor window.
 *
 * A class rather than module state because the tests need instances that cannot
 * see each other, and because a second window should not inherit the first
 * one's failure.
 */
export class CatalogSource {
  private cached: Cached | null = null;
  private lastError: string | null = null;
  private inFlight: Promise<void> | null = null;
  private retryAfter = 0;

  constructor(
    private readonly fetcher: CatalogFetch = defaultFetch,
    private readonly url: string = CATALOG_URL,
  ) {}

  /**
   * The catalog to price against right now, refreshing first if the copy in hand
   * is past `FRESH_MS`.
   *
   * Concurrent callers share one request: the hover provider, the decoration
   * pass and the diagnostics pass all ask on the same keystroke, and three
   * simultaneous fetches of the same file would be three times the traffic for
   * one answer.
   */
  async get(now: number = Date.now()): Promise<CatalogState> {
    if (this.cached && now - this.cached.fetchedAt < FRESH_MS) {
      return {
        status: 'ready',
        catalog: this.cached.catalog,
        generatedAt: this.cached.generatedAt,
        ageing: false,
      };
    }
    if (now < this.retryAfter) return this.state(now);

    this.inFlight ??= this.refresh(now).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;

    return this.state(now);
  }

  /** The state without triggering a fetch — for the status bar, which polls. */
  peek(now: number = Date.now()): CatalogState {
    return this.state(now);
  }

  /** Drop the cache and the last error, so the next `get` fetches afresh. */
  reset(): void {
    this.cached = null;
    this.lastError = null;
    this.retryAfter = 0;
  }

  private state(now: number): CatalogState {
    if (!this.cached) {
      return {
        status: 'unavailable',
        reason: `Could not reach the PromptSpend catalog at ${this.url}. ${this.lastError ?? ''}`.trim(),
      };
    }
    const age = now - this.cached.fetchedAt;
    if (age >= GRACE_MS) {
      return {
        status: 'unavailable',
        reason:
          `The PromptSpend catalog has not refreshed for over 24 hours, so prices are being withheld ` +
          `rather than shown out of date. ${this.lastError ?? ''}`.trim(),
      };
    }
    return {
      status: 'ready',
      catalog: this.cached.catalog,
      generatedAt: this.cached.generatedAt,
      ageing: age >= FRESH_MS,
    };
  }

  private async refresh(now: number): Promise<void> {
    try {
      const raw = await this.fetcher(this.url);
      this.cached = { catalog: new Catalog(raw), generatedAt: raw.generatedAt, fetchedAt: now };
      this.lastError = null;
      this.retryAfter = 0;
    } catch (cause) {
      // Keep whatever is cached; `state()` decides whether it is still usable.
      // Losing the good copy because one request failed would turn a flaky
      // network into an outage.
      this.lastError = String(cause);
      this.retryAfter = now + FAILURE_BACKOFF_MS;
    }
  }
}
