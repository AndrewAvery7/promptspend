import { compareModels, type Model, type Scale, type Workload } from '@promptspend/core';

import { buildSavingsPlaybook } from '@/lib/savingsPlaybook';

const scale: Scale = {
  conversationsPerDay: 1000,
  monthlyActiveUsers: 500,
  revenuePerUserPerMonth: 20,
};
const workload: Workload = { outputTokens: 1000, systemTokens: 1000, turns: 4, userTokens: 500 };

function model(id: string, input: number, output: number, extras: Partial<Model['pricing']> = {}): Model {
  return {
    capabilities: { reasoning: false, vision: false },
    contextWindow: 128000,
    displayName: id,
    id,
    pricing: { input, output, ...extras },
    provenance: { lastVerified: '2026-08-12', source: 'vendor' },
    providerId: 'test',
    status: 'current',
    tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
  };
}

describe('Savings Playbook', () => {
  test('ranks deterministic, positive savings and explains model non-equivalence', () => {
    const current = model('Current model', 5, 20, {
      batchDiscount: 0.5,
      cachedInput: 1,
      cacheWrite: 6.25,
    });
    const alternative = model('Lower-cost model', 1, 2);
    const rows = compareModels([current, alternative], workload, scale);
    const levers = buildSavingsPlaybook({
      comparisonRows: rows,
      model: current,
      options: {},
      scale,
      workload,
    });

    expect(levers.length).toBeGreaterThanOrEqual(4);
    expect(levers.every((lever) => lever.monthlySavings > 0 && lever.annualSavings > 0)).toBe(true);
    expect(levers).toEqual([...levers].sort((a, b) => b.monthlySavings - a.monthlySavings));
    expect(levers.find((lever) => lever.kind === 'model')?.caution).toContain(
      'does not establish equivalent',
    );
    expect(levers.map((lever) => lever.kind)).toEqual(
      expect.arrayContaining(['batch', 'cache', 'model', 'output', 'turns']),
    );
  });

  test('does not offer caching or batch when the model publishes no applicable rate', () => {
    const current = model('Plain model', 2, 8);
    const rows = compareModels([current], workload, scale);
    const levers = buildSavingsPlaybook({
      comparisonRows: rows,
      model: current,
      options: {},
      scale,
      workload,
    });

    expect(levers.some((lever) => lever.kind === 'cache')).toBe(false);
    expect(levers.some((lever) => lever.kind === 'batch')).toBe(false);
  });

  test('returns no flattering recommendation for a zero-volume scenario', () => {
    const current = model('Current model', 5, 20, { batchDiscount: 0.5, cachedInput: 1 });
    const zeroScale = { ...scale, conversationsPerDay: 0 };
    const rows = compareModels([current], workload, zeroScale);

    expect(
      buildSavingsPlaybook({ comparisonRows: rows, model: current, options: {}, scale: zeroScale, workload }),
    ).toEqual([]);
  });
});
