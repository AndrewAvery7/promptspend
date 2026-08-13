import type { Model, Scale, Workload } from '@promptspend/core';

import { evaluateSensitivity } from '@/lib/sensitivity';

const model: Model = {
  capabilities: { reasoning: false, vision: false },
  contextWindow: 128000,
  displayName: 'Test model',
  id: 'test-model',
  pricing: { input: 2, output: 10 },
  provenance: { lastVerified: '2026-08-12', source: 'vendor' },
  providerId: 'test',
  status: 'current',
  tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
};
const workload: Workload = { outputTokens: 1000, systemTokens: 500, turns: 4, userTokens: 250 };
const scale: Scale = { conversationsPerDay: 1000, monthlyActiveUsers: 500, revenuePerUserPerMonth: 20 };

describe('Cost Sensitivity Lab', () => {
  test('reproduces the baseline when assumptions do not change', () => {
    const result = evaluateSensitivity(
      model,
      workload,
      scale,
      { conversationsPerDay: 1000, outputTokens: 1000, turns: 4 },
      {},
    );

    expect(result.preview).toEqual(result.baseline);
    expect(result.monthlyDelta).toBe(0);
    expect(result.percentDelta).toBe(0);
  });

  test('prices combined traffic, response, and turn changes from the shared cost engine', () => {
    const result = evaluateSensitivity(
      model,
      workload,
      scale,
      { conversationsPerDay: 2000, outputTokens: 1500, turns: 6 },
      {},
    );

    expect(result.preview.perMonth).toBeGreaterThan(result.baseline.perMonth * 2);
    expect(result.monthlyDelta).toBe(result.preview.perMonth - result.baseline.perMonth);
    expect(result.percentDelta).toBeCloseTo(result.monthlyDelta / result.baseline.perMonth);
  });

  test('handles zero baseline volume without returning an invalid percentage', () => {
    const zeroScale = { ...scale, conversationsPerDay: 0 };
    const result = evaluateSensitivity(
      model,
      workload,
      zeroScale,
      { conversationsPerDay: 100, outputTokens: 1000, turns: 4 },
      {},
    );

    expect(result.baseline.perMonth).toBe(0);
    expect(result.preview.perMonth).toBeGreaterThan(0);
    expect(result.percentDelta).toBeNull();
  });
});
