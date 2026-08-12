import { Catalog, SCHEMA_VERSION, compareModels, type Model, type PricingCatalog } from '@promptspend/core';

import { buildCostReceiptData, costReceiptAccessibilityLabel } from '@/lib/costReceipt';

function model(id: string, displayName: string, input: number, output: number): Model {
  return {
    capabilities: { reasoning: false, vision: false },
    contextWindow: 128000,
    displayName,
    id,
    pricing: { input, output },
    provenance: { lastVerified: '2026-08-12', source: 'vendor' },
    providerId: 'test',
    status: 'current',
    tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
  };
}

const cheap = model('cheap', 'Efficient model', 1, 2);
const expensive = model('expensive', 'Premium model', 8, 24);
const raw: PricingCatalog = {
  generatedAt: '2026-08-12T12:00:00.000Z',
  models: [cheap, expensive],
  providers: [{ country: 'US', id: 'test', name: 'Test Provider' }],
  schemaVersion: SCHEMA_VERSION,
};
const catalog = new Catalog(raw);
const rows = compareModels(
  [expensive, cheap],
  { outputTokens: 900, systemTokens: 800, turns: 6, userTokens: 400 },
  { conversationsPerDay: 2500, monthlyActiveUsers: 1000, revenuePerUserPerMonth: 0 },
);

describe('AI Cost Receipt', () => {
  test('sorts a comparison, labels the lowest model, and exposes annual spread', () => {
    const receipt = buildCostReceiptData({
      batchEnabled: false,
      cacheShare: 0,
      catalog,
      conversationsPerDay: 2500,
      outputTokens: 900,
      pastedFields: [],
      reasoningMultiplier: 1,
      rows,
      systemTokens: 800,
      turns: 6,
      userTokens: 400,
    });

    expect(receipt?.isComparison).toBe(true);
    expect(receipt?.rows[0]).toMatchObject({ isLowest: true, modelName: 'Efficient model' });
    expect(receipt?.rows[1]?.deltaLabel).toMatch(/^\+\$/);
    expect(receipt?.savingsLabel).toContain('annual spread');
    expect(costReceiptAccessibilityLabel(receipt!)).toContain('Premium model');
  });

  test('cannot carry a private prompt and states the on-device paste boundary', () => {
    const privatePrompt = 'SENTINEL_PRIVATE_PROMPT_DO_NOT_SHARE';
    const receipt = buildCostReceiptData({
      batchEnabled: true,
      cacheShare: 0.6,
      catalog,
      conversationsPerDay: 2500,
      outputTokens: privatePrompt.length,
      pastedFields: ['system'],
      reasoningMultiplier: 1.2,
      rows: [rows[0]!],
      systemTokens: privatePrompt.length,
      turns: 6,
      userTokens: 400,
    });
    const serialized = JSON.stringify(receipt);

    expect(serialized).not.toContain(privatePrompt);
    expect(receipt?.privacyLine).toContain('stayed on-device');
    expect(receipt?.assumptionLines).toEqual(
      expect.arrayContaining([
        '60% prompt-cache hit share',
        'Published batch pricing applied where available',
        '1.2× reasoning-token multiplier',
      ]),
    );
  });

  test('returns no artifact for an empty result', () => {
    expect(
      buildCostReceiptData({
        batchEnabled: false,
        cacheShare: 0,
        catalog,
        conversationsPerDay: 0,
        outputTokens: 0,
        pastedFields: [],
        reasoningMultiplier: 1,
        rows: [],
        systemTokens: 0,
        turns: 1,
        userTokens: 0,
      }),
    ).toBeNull();
  });
});
