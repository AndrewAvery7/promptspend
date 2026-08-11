import {
  MAX_COMPARISON_MODELS,
  defaultComparisonSelection,
  toggleComparisonSelection,
} from '../../../apps/mobile/src/lib/comparison';
import { compareModels } from '@/lib/engine/cost';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import pricing from '../../../public/data/pricing.json';

describe('mobile comparison selection', () => {
  it('uses the same preferred four-model shortlist as the website when available', () => {
    const available = [
      { id: 'other', pricing: { output: 3 } },
      { id: 'moonshot-kimi-k2.5', pricing: { output: 2 } },
      { id: 'deepseek-deepseek-v3.2', pricing: { output: 1 } },
      { id: 'gpt-5.4', pricing: { output: 5 } },
      { id: 'claude-sonnet-5', pricing: { output: 4 } },
    ];

    expect(defaultComparisonSelection(available)).toEqual([
      'claude-sonnet-5',
      'gpt-5.4',
      'deepseek-deepseek-v3.2',
      'moonshot-kimi-k2.5',
    ]);
  });

  it('falls back to two expensive and two inexpensive models', () => {
    expect(
      defaultComparisonSelection([
        { id: 'one', pricing: { output: 1 } },
        { id: 'two', pricing: { output: 2 } },
        { id: 'three', pricing: { output: 3 } },
        { id: 'four', pricing: { output: 4 } },
        { id: 'five', pricing: { output: 5 } },
      ]),
    ).toEqual(['four', 'five', 'one', 'two']);
    expect(MAX_COMPARISON_MODELS).toBe(4);
  });

  it('adds and removes selections while preserving their order', () => {
    expect(toggleComparisonSelection(['one', 'two'], 'three')).toEqual({
      accepted: true,
      selectedIds: ['one', 'two', 'three'],
    });
    expect(toggleComparisonSelection(['one', 'two', 'three'], 'two')).toEqual({
      accepted: true,
      selectedIds: ['one', 'three'],
    });
  });

  it('rejects a fifth selection without changing the current four', () => {
    const current = ['one', 'two', 'three', 'four'];
    expect(toggleComparisonSelection(current, 'five')).toEqual({
      accepted: false,
      selectedIds: current,
    });
  });

  it('prices a real four-model mobile shortlist cheapest first with one shared workload', () => {
    const catalog = new Catalog(pricing as PricingCatalog);
    const selectedIds = defaultComparisonSelection(catalog.primaryModels);
    const rows = compareModels(
      catalog.getAll(selectedIds),
      { systemTokens: 800, userTokens: 400, outputTokens: 900, turns: 6 },
      { conversationsPerDay: 2500, monthlyActiveUsers: 1, revenuePerUserPerMonth: 0 },
      { cachedInputShare: 0 },
    );

    expect(rows).toHaveLength(4);
    expect(rows[0]?.isCheapest).toBe(true);
    expect(rows.map((row) => row.scaled.perMonth)).toEqual(
      [...rows].map((row) => row.scaled.perMonth).sort((left, right) => left - right),
    );
    expect(rows.slice(1).every((row) => row.deltaPerMonth >= 0 && row.multipleOfCheapest >= 1)).toBe(true);
    expect(new Set(rows.map((row) => row.breakdown.inputTokens))).toEqual(new Set([26700]));
    expect(new Set(rows.map((row) => row.breakdown.outputTokens))).toEqual(new Set([5400]));
  });
});
