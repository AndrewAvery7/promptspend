import { describe, expect, it } from 'vitest';
import { Catalog } from './catalog';
import { SCHEMA_VERSION, validateCatalog, type PricingCatalog } from './types';

const CATALOG: PricingCatalog = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-08-01T06:00:00.000Z',
  providers: [
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
    { id: 'deepseek', name: 'DeepSeek', country: 'CN' },
  ],
  models: [
    {
      id: 'claude-sonnet-5',
      providerId: 'anthropic',
      displayName: 'Claude Sonnet 5',
      status: 'current',
      contextWindow: 1_000_000,
      pricing: { input: 3, output: 15, cachedInput: 0.3 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      capabilityIndex: 90,
      provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    },
    {
      id: 'deepseek-v3.2',
      providerId: 'deepseek',
      displayName: 'DeepSeek V3.2',
      status: 'current',
      contextWindow: 163_840,
      pricing: { input: 0.28, output: 0.4 },
      tokenizer: { kind: 'approx', charsPerToken: 3.4, cjkCharsPerToken: 1.7 },
      capabilities: { reasoning: true, vision: false },
      capabilityIndex: 74,
      provenance: { source: 'litellm', lastVerified: '2026-08-01' },
    },
  ],
};

describe('validateCatalog', () => {
  it('accepts a well-formed catalog', () => {
    expect(validateCatalog(CATALOG)).toEqual([]);
  });

  it('rejects a schema version it does not understand', () => {
    expect(validateCatalog({ ...CATALOG, schemaVersion: 99 })).toContainEqual(
      expect.stringContaining('schemaVersion'),
    );
  });

  it('catches a model pointing at a provider that does not exist', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, providerId: 'ghost' }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('not in providers'));
  });

  it('catches duplicate model ids', () => {
    const broken = { ...CATALOG, models: [CATALOG.models[0]!, CATALOG.models[0]!] };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('duplicate'));
  });

  it('rejects negative rates', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, pricing: { input: -1, output: 5 } }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('non-negative'));
  });

  it('flags an output rate that is implausibly low against input — a parse error upstream', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, pricing: { input: 30, output: 0.5 } }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('implausibly low'));
  });

  // The validator used to check base rates and little else, so every field
  // added since — cache rates, tiers, tokenizer specs, review state — could
  // carry nonsense straight through to the app.
  it('rejects a cached rate that costs more than fresh input', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, pricing: { input: 3, output: 15, cachedInput: 4 } }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('costs more than fresh input'));
  });

  it('rejects a cache-write rate cheaper than input', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, pricing: { input: 3, output: 15, cacheWrite: 1 } }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('cheaper than input'));
  });

  it('rejects a long-context tier cheaper than the base rate', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          pricing: {
            input: 3,
            output: 15,
            longContext: { thresholdTokens: 272_000, input: 1, output: 20 },
          },
        },
      ],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('cheaper than the base rate'));
  });

  it('rejects an unknown status and an unknown tokenizer kind', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          status: 'retired' as never,
          tokenizer: { kind: 'magic' } as never,
        },
      ],
    };
    const errors = validateCatalog(broken);
    expect(errors).toContainEqual(expect.stringContaining('status must be one of'));
    expect(errors).toContainEqual(expect.stringContaining('tokenizer.kind'));
  });

  it('rejects an alias pointing at a model that is not in the catalog', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, aliasOf: 'does-not-exist' }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('is not a known model'));
  });

  it('rejects maxOutput larger than the context window', () => {
    const broken = {
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, contextWindow: 1000, maxOutput: 2000 }],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('exceeds contextWindow'));
  });

  it('rejects a review flag with no explanation', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          provenance: { source: 'litellm' as const, lastVerified: '2026-08-01', needsReview: true },
        },
      ],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('reviewNote is empty'));
  });

  it('rejects a malformed provider block', () => {
    const broken = { ...CATALOG, providers: [{ id: 'anthropic', name: 'Anthropic', country: 'usa' }] };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('ISO-3166'));
  });

  it('rejects a non-https source link', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          provenance: {
            source: 'vendor' as const,
            lastVerified: '2026-08-01',
            verifiedUrl: 'http://example.com',
          },
        },
      ],
    };
    expect(validateCatalog(broken)).toContainEqual(expect.stringContaining('verifiedUrl must be https'));
  });
});

describe('Catalog', () => {
  const catalog = new Catalog(CATALOG);

  it('looks models up by id and ignores unknown ones', () => {
    expect(catalog.get('claude-sonnet-5')?.displayName).toBe('Claude Sonnet 5');
    expect(catalog.get('nope')).toBeUndefined();
    expect(catalog.getAll(['claude-sonnet-5', 'nope'])).toHaveLength(1);
  });

  it('groups by provider and filters on a search term', () => {
    expect(catalog.byProvider()).toHaveLength(2);
    const filtered = catalog.byProvider('deepseek');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.models[0]!.id).toBe('deepseek-v3.2');
  });

  it('matches on provider name as well as model name', () => {
    expect(catalog.byProvider('anthropic')[0]!.models[0]!.id).toBe('claude-sonnet-5');
  });

  it('weights the blended rate towards input, as real workloads do', () => {
    expect(Catalog.blendedRate(CATALOG.models[0]!)).toBeCloseTo(0.75 * 3 + 0.25 * 15, 10);
  });

  it('compares like with like in the headline spread', () => {
    // The old version divided the priciest *output* rate by the cheapest
    // *input* rate — 53x here rather than 18x — which is a ratio between two
    // different goods and cannot be checked against anything on the page.
    const spread = catalog.rateSpread();
    expect(spread?.cheapest.id).toBe('deepseek-v3.2');
    expect(spread?.priciest.id).toBe('claude-sonnet-5');
    expect(spread?.cheapestRate).toBeCloseTo(0.75 * 0.28 + 0.25 * 0.4, 10);
    expect(spread?.priciestRate).toBeCloseTo(0.75 * 3 + 0.25 * 15, 10);
    expect(spread?.multiple).toBeCloseTo(spread!.priciestRate / spread!.cheapestRate, 10);
    expect(spread!.multiple).toBeLessThan(15 / 0.28);
  });

  it('keeps aliases out of the picker, the spread and the model count', () => {
    const withAlias = new Catalog({
      ...CATALOG,
      models: [
        ...CATALOG.models,
        {
          ...CATALOG.models[0]!,
          id: 'claude-sonnet-5-alias',
          displayName: 'Sonnet 5 (alias)',
          aliasOf: 'claude-sonnet-5',
        },
      ],
    });
    expect(withAlias.models).toHaveLength(3);
    expect(withAlias.primaryModels).toHaveLength(2);
    expect(withAlias.byProvider().flatMap((g) => g.models)).toHaveLength(2);
    expect(withAlias.aliasesOf('claude-sonnet-5').map((m) => m.id)).toEqual(['claude-sonnet-5-alias']);
  });

  it('reports when prices last changed, not when a job last ran', () => {
    const dated = new Catalog({
      ...CATALOG,
      generatedAt: '2026-09-30T06:00:00.000Z',
      models: CATALOG.models.map((m, index) => ({
        ...m,
        provenance: { ...m.provenance, lastChanged: index === 0 ? '2026-07-04' : '2026-06-01' },
      })),
    });
    expect(dated.pricesLastChanged()).toBe('2026-07-04');
    expect(dated.sourcesLastChecked()).toBeNull();
  });

  // The landing page shows this figure, and it is the one the whole project is
  // selling. Counting aliases would inflate it, and counting anything but a
  // vendor-sourced row would make it a different claim entirely.
  it('counts only primary rows read against a vendor page', () => {
    const mixed = new Catalog({
      ...CATALOG,
      models: CATALOG.models.map((m, index) => ({
        ...m,
        provenance: { ...m.provenance, source: index === 0 ? ('vendor' as const) : ('litellm' as const) },
      })),
    });
    expect(mixed.vendorVerifiedCount()).toBe(1);
    expect(mixed.vendorVerifiedCount()).toBeLessThanOrEqual(mixed.primaryModels.length);
  });

  // This used to fall back to `generatedAt`. A catalog carrying no change
  // history therefore reported the build date, so the site announced a price
  // change every morning it was rebuilt and looked plausible doing it.
  it('says nothing rather than today when no change has been recorded', () => {
    const undated = new Catalog({
      ...CATALOG,
      generatedAt: '2026-09-30T06:00:00.000Z',
      models: CATALOG.models.map(({ provenance: { lastChanged: _unknown, ...provenance }, ...m }) => ({
        ...m,
        provenance,
      })),
    });
    expect(undated.pricesLastChanged()).toBeNull();
  });

  it('reads the sync manifest when one is supplied', () => {
    const withHealth = new Catalog(CATALOG, {
      schemaVersion: 1,
      attemptedAt: '2026-09-30T06:00:00.000Z',
      succeededAt: '2026-09-30T06:00:00.000Z',
      outcome: 'ok',
      problems: [],
      sources: [],
      modelCount: 2,
      flaggedCount: 0,
      staleCount: 0,
      catalogHash: 'abc',
      pricesLastChanged: '2026-07-04',
    });
    expect(withHealth.sourcesLastChecked()).toBe('2026-09-30');
  });
});
