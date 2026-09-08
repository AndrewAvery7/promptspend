import type { Model } from '@promptspend/core';

import { modelRateDisplay } from '@/lib/pricingDisplay';

const model: Model = {
  capabilities: { reasoning: false, vision: false },
  contextWindow: 128_000,
  displayName: 'Promotional model',
  id: 'promotional-model',
  pricing: { input: 3, intro: { input: 1, output: 4, until: '2026-08-31' }, output: 12 },
  provenance: { lastVerified: '2026-08-01', source: 'vendor' },
  providerId: 'vendor',
  status: 'current',
  tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
};

describe('mobile promotional-rate display', () => {
  test('shows the active rate, end date, and standard-rate context', () => {
    const display = modelRateDisplay(model, new Date('2026-08-15T12:00:00Z'));
    expect(display).toMatchObject({
      input: '$1',
      output: '$4',
      promoLabel: 'INTRO PRICE · through 2026-08-31',
      standardLabel: '$3 input · $12 output standard',
    });
    expect(display.accessibility).toContain('Intro price through 2026-08-31');
  });

  test('shows only standard rates after expiration', () => {
    expect(modelRateDisplay(model, new Date('2026-09-01T12:00:00Z'))).toMatchObject({
      input: '$3',
      output: '$12',
      promoLabel: null,
      standardLabel: null,
    });
  });
});
