import type { Model, PricingCatalog, Provider } from './types';
import { assertCatalog } from './types';

/** Index a catalog for the lookups the UI does on every render. */
export class Catalog {
  readonly generatedAt: Date;
  readonly models: Model[];
  readonly providers: Provider[];
  private readonly byId: Map<string, Model>;
  private readonly providerById: Map<string, Provider>;

  constructor(raw: PricingCatalog) {
    this.generatedAt = new Date(raw.generatedAt);
    this.providers = raw.providers;
    this.providerById = new Map(raw.providers.map((p) => [p.id, p]));
    this.models = [...raw.models].sort(
      (a, b) =>
        this.providerName(a).localeCompare(this.providerName(b)) || a.pricing.output - b.pricing.output,
    );
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

  /** Models grouped by provider, in display order. */
  byProvider(filter = ''): { provider: Provider; models: Model[] }[] {
    const needle = filter.trim().toLowerCase();
    const groups = new Map<string, Model[]>();

    for (const model of this.models) {
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

  /** The headline "price spread" figure: priciest output rate ÷ cheapest input rate. */
  outputSpread(): { multiple: number; cheapest: Model; priciest: Model } | null {
    const withPrices = this.models.filter((m) => m.pricing.output > 0 && m.pricing.input > 0);
    if (withPrices.length < 2) return null;
    let cheapest = withPrices[0]!;
    let priciest = withPrices[0]!;
    for (const model of withPrices) {
      if (model.pricing.input < cheapest.pricing.input) cheapest = model;
      if (model.pricing.output > priciest.pricing.output) priciest = model;
    }
    return {
      multiple: priciest.pricing.output / cheapest.pricing.input,
      cheapest,
      priciest,
    };
  }
}

/** Fetch and validate the published catalog. */
export async function loadCatalog(url: string): Promise<Catalog> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Could not load pricing data (HTTP ${response.status})`);
  }
  const raw: unknown = await response.json();
  assertCatalog(raw);
  return new Catalog(raw);
}
