import { describe, expect, it } from 'vitest';

import type { Model } from './types';
import { rateOn } from './promo';

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

describe('shared promotional-rate display contract', () => {
  it('uses the introductory value through the inclusive end date', () => {
    expect(rateOn(model, 'input', new Date('2026-08-31T23:59:59.999Z'))).toEqual({
      promo: { standard: 3, until: '2026-08-31' },
      value: 1,
    });
  });

  it('returns to the standard value after expiration', () => {
    expect(rateOn(model, 'input', new Date('2026-09-01T00:00:00.000Z'))).toEqual({
      promo: null,
      value: 3,
    });
  });
});
