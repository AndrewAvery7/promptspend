import { describe, expect, it } from 'vitest';
import { Catalog } from './catalog';
import type { SyncStatus } from './health';
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
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-01',
        verifiedUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
      },
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

  it('validates promotional cache rates as strictly as standard rates', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          pricing: {
            input: 3,
            output: 15,
            intro: {
              input: 2,
              output: 10,
              cachedInput: 3,
              cacheWrite: 1,
              until: '2026-08-31',
            },
          },
        },
      ],
    };
    const problems = validateCatalog(broken).join(' ');
    expect(problems).toContain('pricing.intro.cachedInput');
    expect(problems).toContain('pricing.intro.cacheWrite');
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

  it('requires a source URL for vendor provenance', () => {
    const broken = {
      ...CATALOG,
      models: [
        {
          ...CATALOG.models[0]!,
          provenance: { source: 'vendor' as const, lastVerified: '2026-08-01' },
        },
      ],
    };
    expect(validateCatalog(broken)).toContainEqual(
      expect.stringContaining('vendor provenance requires provenance.verifiedUrl'),
    );
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

  it('reports the countries it actually carries, with a count behind each', () => {
    expect(catalog.countries()).toEqual([
      { code: 'CN', count: 1 },
      { code: 'US', count: 1 },
    ]);
  });

  it('orders countries by size, so the largest is the first chip', () => {
    const withSecondUsProvider = new Catalog({
      ...CATALOG,
      providers: [...CATALOG.providers, { id: 'openai', name: 'OpenAI', country: 'US' }],
      models: [...CATALOG.models, { ...CATALOG.models[0]!, id: 'gpt-5', providerId: 'openai' }],
    });
    expect(withSecondUsProvider.countries()).toEqual([
      { code: 'US', count: 2 },
      { code: 'CN', count: 1 },
    ]);
  });

  it('counts purchasable models per country, not alias rows', () => {
    const withAlias = new Catalog({
      ...CATALOG,
      models: [...CATALOG.models, { ...CATALOG.models[1]!, id: 'deepseek-chat', aliasOf: 'deepseek-v3.2' }],
    });
    // The alias routes to a model already counted; counting it would promise
    // the filter leaves two rows behind where it leaves one.
    expect(withAlias.countries()).toContainEqual({ code: 'CN', count: 1 });
  });

  it('narrows the picker to the chosen countries', () => {
    const chinese = catalog.byProvider('', ['CN']);
    expect(chinese).toHaveLength(1);
    expect(chinese[0]!.models[0]!.id).toBe('deepseek-v3.2');
    expect(catalog.byProvider('', ['CN', 'US'])).toHaveLength(2);
  });

  it('applies the country filter and the search term together', () => {
    // Searching for a US model while filtered to China is a legitimate empty
    // result, not a match on either half.
    expect(catalog.byProvider('claude', ['CN'])).toHaveLength(0);
    expect(catalog.byProvider('deepseek', ['CN'])).toHaveLength(1);
  });

  it('treats an empty country list as every country, never as none', () => {
    expect(catalog.byProvider('', [])).toHaveLength(2);
    expect(catalog.inCountries(CATALOG.models[0]!, [])).toBe(true);
    expect(catalog.inCountries(CATALOG.models[0]!, ['CN'])).toBe(false);
    expect(catalog.inCountries(CATALOG.models[1]!, ['CN'])).toBe(true);
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

describe('Catalog.freshness', () => {
  const health = (over: Partial<SyncStatus> = {}): SyncStatus => ({
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
    pricesLastChanged: null,
    ...over,
  });

  /**
   * The reader's clock, not UTC. Built with the local-time constructor on
   * purpose: `new Date('2026-10-02T09:00:00Z')` is the 1st for anyone at
   * UTC-10, which would make these assertions pass or fail depending on where
   * the suite runs — and the day-boundary arithmetic is the whole subject.
   */
  const on = (day: string, over: Partial<SyncStatus> = {}) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Catalog(CATALOG, health(over)).freshness(new Date(year!, month! - 1, date!, 9, 0));
  };

  it('is fresh the day of a clean run and the day after', () => {
    expect(on('2026-09-30')).toEqual({ level: 'fresh', checkedOn: '2026-09-30', ageDays: 0 });
    expect(on('2026-10-01').level).toBe('fresh');
  });

  /**
   * The defect this caught: subtracting `Date.parse('2026-08-06')` (midnight
   * UTC) from a local evening put the age at 24.5 hours, so the chip read
   * "CHECKED 6 AUG" at 7pm on the 6th of August.
   */
  it('still says today late in the evening west of UTC', () => {
    const lateLocal = new Date(2026, 8, 30, 23, 30);
    expect(new Catalog(CATALOG, health()).freshness(lateLocal).ageDays).toBe(0);
  });

  // Two days is the window `.github/workflows/freshness.yml` tolerates before
  // it files an issue. A quiet weekend must not look like a fault.
  it('ages at two days and goes stale past the monitor’s threshold', () => {
    expect(on('2026-10-02').level).toBe('aging');
    expect(on('2026-10-03').level).toBe('stale');
  });

  it('is stale whenever the last run was degraded, however recent', () => {
    expect(on('2026-09-30', { outcome: 'degraded' }).level).toBe('stale');
  });

  /**
   * The one that matters most: a status light that reads "fine" when its own
   * evidence failed to load is the failure the freshness monitor exists to
   * catch. Unknown is its own state, never a quiet fall back to healthy.
   */
  it('reports unknown rather than fresh when the manifest is missing', () => {
    expect(new Catalog(CATALOG).freshness(new Date(2026, 8, 30, 9, 0))).toEqual({
      level: 'unknown',
      checkedOn: null,
      ageDays: null,
    });
    expect(on('2026-09-30', { succeededAt: null }).level).toBe('unknown');
  });

  it('never reports a negative age when a clock is behind the manifest', () => {
    expect(on('2026-09-28')).toEqual({
      level: 'unknown',
      checkedOn: '2026-09-30',
      ageDays: null,
    });
  });
});
