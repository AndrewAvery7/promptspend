import { Catalog, type PricingCatalog } from '@promptspend/core';

import type { MobileCatalogResult } from '@/data/catalog';
import {
  isCatalogResultUsable,
  reconcileComparisonSelection,
  resolveSelectedModelId,
} from '@/state/useLaunchState';

const pricing: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-16T12:00:00.000Z',
  providers: [{ id: 'test', name: 'Test', country: 'US' }],
  models: ['claude-sonnet-5', 'model-b', 'model-c', 'model-d', 'model-e'].map((id, index) => ({
    id,
    providerId: 'test',
    displayName: id,
    status: 'current' as const,
    contextWindow: 128_000,
    pricing: { input: 1 + index, output: 2 + index },
    tokenizer: { kind: 'approx' as const, charsPerToken: 4, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor' as const, lastVerified: '2026-08-16' },
  })),
};

const catalog = new Catalog(pricing);

describe('launch catalog reconciliation', () => {
  test('keeps valid unique comparison ids and enforces the four-model ceiling', () => {
    expect(
      reconcileComparisonSelection(catalog, ['model-b', 'model-b', 'model-c', 'model-d', 'model-e']),
    ).toEqual(['model-b', 'model-c', 'model-d', 'model-e']);
  });

  test('uses one consistent fallback when a restored model no longer exists', () => {
    expect(resolveSelectedModelId(catalog, 'removed-model')).toBe('claude-sonnet-5');
  });

  test('treats a catalog as usable only inside the 24-hour window', () => {
    const result: MobileCatalogResult = {
      catalog,
      refreshedAt: new Date('2026-08-15T12:00:00.001Z'),
      source: 'cache',
      warning: null,
    };

    expect(isCatalogResultUsable(result, new Date('2026-08-16T12:00:00.000Z'))).toBe(true);
    expect(
      isCatalogResultUsable(
        { ...result, refreshedAt: new Date('2026-08-15T12:00:00.000Z') },
        new Date('2026-08-16T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
