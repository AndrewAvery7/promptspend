/**
 * Everything the editor needs, with the editor kept out of it.
 *
 * `extension.ts` should be thin enough to read in one screen; this is where the
 * work it delegates lives, so that all of it stays unit-testable without an
 * editor binary.
 */
import { CatalogSource, type CatalogState } from './catalog';
import { ModelIndex, type ModelMatch, type ScanOptions } from './scan';

export interface ScanOutcome {
  /** Empty whenever the catalog is unavailable — never a partial answer. */
  matches: ModelMatch[];
  /** The catalog state, so the caller can explain an empty result. */
  state: CatalogState;
  /** True when the document was past the size cap and was not looked at. */
  skipped: boolean;
}

export class PricingService {
  private index: ModelIndex | null = null;
  private indexBuiltFor: string | null = null;
  private lastScan: { key: string; outcome: ScanOutcome } | null = null;

  constructor(private readonly source: CatalogSource = new CatalogSource()) {}

  /**
   * Model matches in a document, refreshing the catalog if it is due.
   *
   * The index is rebuilt only when the catalog's `generatedAt` moves. Compiling
   * a hundred-alternative regular expression on every keystroke was the obvious
   * way to make typing in a large file stutter, and the daily artifact changes
   * about as often as its name suggests.
   */
  async scan(
    text: string,
    options: ScanOptions = {},
    now: number = Date.now(),
    cacheKey?: string,
  ): Promise<ScanOutcome> {
    const key = cacheKey === undefined ? undefined : `${cacheKey}:${JSON.stringify(options)}`;
    if (key !== undefined && this.lastScan?.key === key) return this.lastScan.outcome;
    const state = await this.source.get(now);
    if (state.status !== 'ready') return { matches: [], state, skipped: false };

    if (this.indexBuiltFor !== state.generatedAt) {
      this.index = new ModelIndex(state.catalog);
      this.indexBuiltFor = state.generatedAt;
    }

    const { matches, skipped } = this.index!.scan(text, options);
    const outcome = { matches, state, skipped };
    if (key !== undefined) this.lastScan = { key, outcome };
    return outcome;
  }

  /** The current state without triggering a fetch — for the status bar. */
  peek(now: number = Date.now()): CatalogState {
    return this.source.peek(now);
  }

  /**
   * Throw away the cached catalog so the next scan refetches.
   *
   * For the manual refresh command. Waiting out a six-hour interval after a
   * dropped connection is not a reasonable thing to ask of anyone.
   */
  reset(): void {
    this.source.reset();
    this.index = null;
    this.indexBuiltFor = null;
    this.lastScan = null;
  }
}

/**
 * What the status bar says.
 *
 * The site has a live ticker making freshness visceral on every visit; this is
 * that, in an editor. It is also what makes the six-hour refresh interval
 * honest rather than lax — the age of the data is on screen continuously rather
 * than being something a user has to take on trust.
 */
export function statusBarText(state: CatalogState): { text: string; tooltip: string; warning: boolean } {
  if (state.status === 'unavailable') {
    return {
      text: '$(warning) PromptSpend: no prices',
      tooltip: state.reason,
      warning: true,
    };
  }
  const day = state.generatedAt.slice(0, 10);
  return {
    text: `$(database) Prices synced ${day}`,
    tooltip: state.ageing
      ? `Catalog last fetched successfully more than six hours ago; a refresh is failing. ` +
        `Showing the copy generated ${state.generatedAt}.`
      : `PromptSpend catalog generated ${state.generatedAt}. Re-verified every morning.`,
    warning: state.ageing,
  };
}
