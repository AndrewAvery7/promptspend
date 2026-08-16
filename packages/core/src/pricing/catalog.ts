import type { Model, PricingCatalog, Provider } from './types';
import { assertCatalog } from './types';
import { isSyncStatus, type SyncStatus } from './health';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days between an ISO date and a moment, counted the way a
 * reader counts them.
 *
 * Subtracting timestamps is the obvious version and it is wrong: `2026-08-06`
 * parses as midnight *UTC*, so at 7pm on the 6th in Chicago the arithmetic
 * returns 24.5 hours and the chip says "CHECKED 6 AUG" on the very day it was
 * checked. Both sides are reduced to a local midnight instead, and rounded
 * rather than floored so the 23- and 25-hour days either side of a daylight
 * saving change do not shift the answer.
 *
 * A negative value is preserved so callers can avoid claiming that future
 * evidence is current when the device clock is wrong.
 */
function calendarDaysBetween(isoDate: string, now: Date): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return 0;
  const checked = new Date(year, month - 1, day).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - checked) / DAY_MS);
}

/**
 * `fresh`   — checked within a day. `aging` — two days, which the monitor
 * tolerates. `stale` — past the monitor's threshold, or the last run was
 * degraded. `unknown` — the health manifest did not load.
 */
export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface Freshness {
  level: FreshnessLevel;
  /** ISO date of the last clean run, or null when that is not known. */
  checkedOn: string | null;
  ageDays: number | null;
}

/** Index a catalog for the lookups the UI does on every render. */
export class Catalog {
  readonly generatedAt: Date;
  /** Every row, aliases and stale entries included — the table shows them all. */
  readonly models: Model[];
  /** The distinct things you can actually buy: no routing aliases. */
  readonly primaryModels: Model[];
  readonly providers: Provider[];
  /** Health of the last sync run, when the manifest is available. */
  readonly health: SyncStatus | null;
  private readonly byId: Map<string, Model>;
  private readonly providerById: Map<string, Provider>;

  constructor(raw: PricingCatalog, health: SyncStatus | null = null) {
    this.generatedAt = new Date(raw.generatedAt);
    this.providers = raw.providers;
    this.health = health;
    this.providerById = new Map(raw.providers.map((p) => [p.id, p]));
    this.models = [...raw.models].sort(
      (a, b) =>
        this.providerName(a).localeCompare(this.providerName(b)) || a.pricing.output - b.pricing.output,
    );
    this.primaryModels = this.models.filter((m) => m.aliasOf === undefined);
    this.byId = new Map(raw.models.map((m) => [m.id, m]));
  }

  get(id: string): Model | undefined {
    return this.byId.get(id);
  }

  getAll(ids: readonly string[]): Model[] {
    return ids.map((id) => this.byId.get(id)).filter((m): m is Model => m !== undefined);
  }

  provider(model: Model): Provider | undefined {
    return this.providerById.get(model.providerId);
  }

  providerName(model: Model): string {
    return this.providerById.get(model.providerId)?.name ?? model.providerId;
  }

  /** Every id that routes to `model`, for the "also known as" line. */
  aliasesOf(id: string): Model[] {
    return this.models.filter((m) => m.aliasOf === id);
  }

  /**
   * The date the published rates last actually moved, or null while no move
   * has been recorded.
   *
   * Null is a real answer, not a missing one. This used to fall back to
   * `generatedAt`, which meant a catalog carrying no change history displayed
   * the build date — the header announced a price change every morning the
   * site was rebuilt, and it was never wrong-looking enough for anyone to
   * check. Between a date that is always today and an admission that nothing
   * has moved yet, only one of them tells the reader anything.
   */
  pricesLastChanged(): string | null {
    const dates = this.models
      .map((m) => m.provenance.lastChanged)
      .filter((d): d is string => typeof d === 'string');
    return dates.sort().at(-1) ?? null;
  }

  /**
   * How many primary rows were read against the vendor's own pricing page.
   *
   * Derived rather than written down. It is the number this project is really
   * selling, so it is exactly the number that must not be a stale literal
   * somebody forgot to raise after a verification pass.
   */
  vendorVerifiedCount(): number {
    return this.primaryModels.filter((model) => model.provenance.source === 'vendor').length;
  }

  /** The date the sources were last successfully checked, if we know it. */
  sourcesLastChecked(): string | null {
    return this.health?.succeededAt?.slice(0, 10) ?? null;
  }

  /**
   * Whether the pipeline is currently keeping its promise, as a state the UI
   * can colour rather than a date the reader has to interpret.
   *
   * The thresholds match `.github/workflows/freshness.yml`, which raises an
   * issue when the published catalog is more than two days old. A quiet
   * weekend must not look like a fault, and a fault must not look quiet.
   *
   * `unknown` is deliberately its own state rather than falling back to
   * `fresh`. A status light that reads "fine" when its own evidence failed to
   * load is the exact failure the freshness monitor exists to catch.
   */
  freshness(now: Date = new Date()): Freshness {
    const checkedOn = this.sourcesLastChecked();
    if (!this.health || !checkedOn) return { level: 'unknown', checkedOn: null, ageDays: null };

    const ageDays = calendarDaysBetween(checkedOn, now);
    if (ageDays < 0) return { level: 'unknown', checkedOn, ageDays: null };
    if (this.health.outcome === 'degraded' || ageDays > 2) {
      return { level: 'stale', checkedOn, ageDays };
    }
    return { level: ageDays >= 2 ? 'aging' : 'fresh', checkedOn, ageDays };
  }

  /** Models grouped by provider, in display order. Aliases are left out: one
   *  purchasable model should appear in the picker once. */
  byProvider(filter = ''): { provider: Provider; models: Model[] }[] {
    const needle = filter.trim().toLowerCase();
    const groups = new Map<string, Model[]>();

    for (const model of this.primaryModels) {
      if (needle) {
        const haystack = `${model.displayName} ${this.providerName(model)} ${model.id}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      const list = groups.get(model.providerId) ?? [];
      list.push(model);
      groups.set(model.providerId, list);
    }

    return [...groups.entries()]
      .map(([providerId, models]) => ({
        provider: this.providerById.get(providerId) ?? {
          id: providerId,
          name: providerId,
          country: '??',
        },
        models,
      }))
      .sort((a, b) => a.provider.name.localeCompare(b.provider.name));
  }

  /** Blended $/1M used as the value map's X axis: input-weighted, since most
   *  production workloads read far more than they write. */
  static blendedRate(model: Model): number {
    return 0.75 * model.pricing.input + 0.25 * model.pricing.output;
  }

  /**
   * The headline "price spread": cheapest against priciest on the *same*
   * measure.
   *
   * This used to divide the priciest output rate by the cheapest input rate,
   * which produced a much bigger and entirely meaningless number — input and
   * output are different goods, and no one ever chooses between them. Using
   * the blended rate on both sides makes the multiple something a reader can
   * check: it is the ratio of two numbers in the table below it.
   */
  rateSpread(): {
    multiple: number;
    cheapest: Model;
    priciest: Model;
    cheapestRate: number;
    priciestRate: number;
  } | null {
    const priced = this.primaryModels.filter(
      (m) => Catalog.blendedRate(m) > 0 && m.provenance.stale !== true,
    );
    if (priced.length < 2) return null;

    let cheapest = priced[0]!;
    let priciest = priced[0]!;
    for (const model of priced) {
      if (Catalog.blendedRate(model) < Catalog.blendedRate(cheapest)) cheapest = model;
      if (Catalog.blendedRate(model) > Catalog.blendedRate(priciest)) priciest = model;
    }
    const cheapestRate = Catalog.blendedRate(cheapest);
    const priciestRate = Catalog.blendedRate(priciest);
    return { multiple: priciestRate / cheapestRate, cheapest, priciest, cheapestRate, priciestRate };
  }
}

/** Fetch and validate the published catalog, plus the sync health manifest.
 *  A missing or malformed manifest is not fatal — the app simply says less. */
export async function loadCatalog(url: string, healthUrl?: string): Promise<Catalog> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Could not load pricing data (HTTP ${response.status})`);
  }
  const raw: unknown = await response.json();
  assertCatalog(raw);

  let health: SyncStatus | null = null;
  if (healthUrl) {
    try {
      const healthResponse = await fetch(healthUrl, { cache: 'no-cache' });
      if (healthResponse.ok) {
        const parsed: unknown = await healthResponse.json();
        if (isSyncStatus(parsed)) health = parsed;
      }
    } catch {
      /* the manifest is supporting evidence, not a dependency */
    }
  }

  return new Catalog(raw, health);
}
