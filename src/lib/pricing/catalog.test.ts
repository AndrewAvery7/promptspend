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

  it('reports the headline price spread', () => {
    const spread = catalog.outputSpread();
    expect(spread?.cheapest.id).toBe('deepseek-v3.2');
    expect(spread?.priciest.id).toBe('claude-sonnet-5');
    expect(spread?.multiple).toBeCloseTo(15 / 0.28, 6);
  });
});
