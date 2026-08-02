import { describe, expect, it } from 'vitest';
import { buildOutboundChanges } from './notify';
import { SCHEMA_VERSION, type Model, type PricingCatalog } from '../../src/lib/pricing/types';

function model(overrides: Partial<Model> & { id: string }): Model {
  return {
    providerId: 'openai',
    displayName: overrides.id,
    status: 'current',
    contextWindow: 400_000,
    pricing: { input: 5, output: 30 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: true, vision: true },
    provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    ...overrides,
  };
}

function catalog(models: Model[]): PricingCatalog {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-08-02T06:00:00.000Z',
    providers: [
      { id: 'openai', name: 'OpenAI', country: 'US' },
      { id: 'anthropic', name: 'Anthropic', country: 'US' },
    ],
    models,
  };
}

describe('what reaches a subscriber', () => {
  it('reports a headline rate change once per model, not once per field', () => {
    const before = catalog([model({ id: 'gpt-5.6-sol', pricing: { input: 5, output: 30 } })]);
    const after = catalog([model({ id: 'gpt-5.6-sol', pricing: { input: 4, output: 24 } })]);

    expect(buildOutboundChanges(before, after)).toEqual([
      {
        modelId: 'gpt-5.6-sol',
        displayName: 'gpt-5.6-sol',
        provider: 'OpenAI',
        kind: 'price',
        before: { input: 5, output: 30 },
        after: { input: 4, output: 24 },
      },
    ]);
  });

  it('reports an addition with the rates it arrived at', () => {
    const after = catalog([
      model({ id: 'claude-opus-5', providerId: 'anthropic', pricing: { input: 9, output: 45 } }),
    ]);
    const changes = buildOutboundChanges(catalog([]), after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'added',
      provider: 'Anthropic',
      after: { input: 9, output: 45 },
    });
  });

  it('reports a removal, naming the provider from the catalog that still had it', () => {
    const before = catalog([model({ id: 'gpt-4-legacy' })]);
    const changes = buildOutboundChanges(before, catalog([model({ id: 'gpt-5.6-sol' })]));
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: 'gpt-4-legacy', kind: 'removed', provider: 'OpenAI' }),
      ]),
    );
  });
});

describe('what is deliberately withheld', () => {
  /**
   * The point of the filter. A run that refines a tokenizer ratio or rewords a
   * review note is a real catalog change and belongs in the changelog; waking
   * somebody's phone for it is how a useful alert becomes one people turn off.
   */
  it('stays silent on metadata that costs nobody anything', () => {
    const before = catalog([
      model({ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', contextWindow: 400_000 }),
    ]);
    const after = catalog([
      model({
        id: 'gpt-5.6-sol',
        displayName: 'GPT-5.6 Sol',
        contextWindow: 500_000,
        tokenizer: { kind: 'approx', charsPerToken: 3.9, cjkCharsPerToken: 1.6 },
        provenance: { source: 'vendor', lastVerified: '2026-08-02', reviewNote: 'reworded' },
      }),
    ]);
    expect(buildOutboundChanges(before, after)).toEqual([]);
  });

  it('stays silent when only a secondary rate moves', () => {
    const before = catalog([
      model({ id: 'gpt-5.6-sol', pricing: { input: 5, output: 30, cacheWrite: 6.25 } }),
    ]);
    const after = catalog([model({ id: 'gpt-5.6-sol', pricing: { input: 5, output: 30, cacheWrite: 7.0 } })]);
    expect(buildOutboundChanges(before, after)).toEqual([]);
  });

  /**
   * `gpt-5.6` routes to `gpt-5.6-sol`. Both rows move together on every price
   * change, so counting the alias would tell everyone the same news twice.
   */
  it('does not announce a routing alias as a separate model', () => {
    const before = catalog([
      model({ id: 'gpt-5.6-sol', pricing: { input: 5, output: 30 } }),
      model({ id: 'gpt-5.6', aliasOf: 'gpt-5.6-sol', pricing: { input: 5, output: 30 } }),
    ]);
    const after = catalog([
      model({ id: 'gpt-5.6-sol', pricing: { input: 4, output: 24 } }),
      model({ id: 'gpt-5.6', aliasOf: 'gpt-5.6-sol', pricing: { input: 4, output: 24 } }),
    ]);

    const changes = buildOutboundChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.modelId).toBe('gpt-5.6-sol');
  });

  it('is empty when nothing at all changed', () => {
    const same = catalog([model({ id: 'gpt-5.6-sol' })]);
    expect(buildOutboundChanges(same, same)).toEqual([]);
  });
});
