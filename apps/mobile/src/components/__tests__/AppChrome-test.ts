import type { Catalog, Model } from '@promptspend/core';

import { buildTickerItems, isCompactAppChrome, matchesCommandSearch } from '@/components/AppChrome';

const models = [
  {
    id: 'low',
    displayName: 'Low Cost',
    pricing: { input: 0.1, output: 0.4 },
    provenance: { needsReview: false },
    releaseDate: '2026-08-01',
  },
  {
    id: 'high',
    displayName: 'High Cost',
    pricing: { input: 10, output: 30 },
    provenance: { needsReview: true },
    releaseDate: '2026-08-10',
  },
] as unknown as Model[];

const catalog = {
  models,
  primaryModels: models,
  providers: [{ id: 'test', name: 'Test Provider' }],
  rateSpread: () => ({ cheapest: models[0], multiple: 100, priciest: models[1] }),
} as unknown as Catalog;

describe('mobile pricing ticker', () => {
  test('uses catalog evidence for price, spread, review, and coverage items', () => {
    const items = buildTickerItems(catalog);

    expect(items[0]).toMatchObject({ key: 'cheapest' });
    expect(items.map((item) => item.text).join(' ')).toContain('Low Cost');
    expect(items.map((item) => item.text).join(' ')).toContain('100×');
    expect(items).toContainEqual(expect.objectContaining({ key: 'flagged' }));
    expect(items).toContainEqual(expect.objectContaining({ key: 'coverage' }));
  });

  test('never invents a cheapest-price item when no paid input price exists', () => {
    const freeModel = { ...models[0], pricing: { input: 0, output: 0 } } as Model;
    const freeCatalog = {
      models: [freeModel],
      primaryModels: [freeModel],
      providers: [{ id: 'test', name: 'Test Provider' }],
      rateSpread: () => null,
    } as unknown as Catalog;

    expect(buildTickerItems(freeCatalog).some((item) => item.key === 'cheapest')).toBe(false);
  });
});

describe('responsive app chrome', () => {
  test('moves global actions to their own row on phone widths', () => {
    expect(isCompactAppChrome(360)).toBe(true);
    expect(isCompactAppChrome(430)).toBe(true);
    expect(isCompactAppChrome(768)).toBe(false);
  });

  test('matches natural Help questions without requiring an exact phrase', () => {
    expect(
      matchesCommandSearch(
        'How do I select up to four models? Compare four selected models in one workload.',
        'how do I compare four models',
      ),
    ).toBe(true);
  });
});
