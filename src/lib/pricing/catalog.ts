import type { Model, PricingCatalog, Provider } from './types';
import { assertCatalog } from './types';
import { isSyncStatus, type SyncStatus } from './health';

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
