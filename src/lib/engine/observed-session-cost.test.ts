import type { Model } from '@/lib/pricing/types';
import { observedSessionCost } from './observed-session-cost';

function model(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test-model',
    providerId: 'test',
    displayName: 'Test Model',
    status: 'current',
    contextWindow: 200_000,
    maxOutput: 20_000,
    pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
    tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: true, vision: true },
    provenance: { source: 'vendor', lastVerified: '2026-09-02' },
    ...overrides,
  };
}

describe('observedSessionCost', () => {
  it('prices observed request totals without synthesizing conversation history again', () => {
    const result = observedSessionCost(model(), {
      requests: [
        { inputTokens: 1_000, outputTokens: 200, reasoningTokens: 0 },
        { inputTokens: 2_000, outputTokens: 300, reasoningTokens: 0 },
      ],
    });

    expect(result.inputTokens).toBe(3_000);
    expect(result.outputTokens).toBe(500);
    expect(result.inputCost).toBeCloseTo(0.009, 12);
    expect(result.outputCost).toBeCloseTo(0.0075, 12);
    expect(result.total).toBeCloseTo(0.0165, 12);
    expect(result.warnings).toEqual([]);
  });

  it('separates fresh, cached-read, cache-write and hidden-reasoning charges', () => {
    const result = observedSessionCost(model(), {
      requests: [
        {
          inputTokens: 1_000,
          outputTokens: 200,
          reasoningTokens: 100,
          cachedInputTokens: 500,
          cacheWriteTokens: 100,
        },
      ],
    });

    expect(result.inputCost).toBeCloseTo(0.00135, 12);
    expect(result.cacheWriteCost).toBeCloseTo(0.000375, 12);
    expect(result.outputCost).toBeCloseTo(0.0045, 12);
    expect(result.total).toBeCloseTo(0.006225, 12);
    expect(result.reasoningTokens).toBe(100);
  });

  it('selects long-context rates per request, not for the whole aggregate', () => {
    const result = observedSessionCost(
      model({
        contextWindow: 500_000,
        pricing: {
          input: 2,
          output: 8,
          longContext: { thresholdTokens: 100_000, input: 4, output: 12 },
        },
      }),
      {
        requests: [
          { inputTokens: 80_000, outputTokens: 1_000, reasoningTokens: 0 },
          { inputTokens: 120_000, outputTokens: 1_000, reasoningTokens: 0 },
        ],
      },
    );

    expect(result.longContextRequests).toBe(1);
    expect(result.inputCost).toBeCloseTo(0.64, 12);
    expect(result.outputCost).toBeCloseTo(0.02, 12);
    expect(result.total).toBeCloseTo(0.66, 12);
  });

  it('states when hidden reasoning is unknown instead of implying invoice precision', () => {
    const result = observedSessionCost(model(), {
      requests: [{ inputTokens: 500, outputTokens: 100 }],
    });

    expect(result.warnings).toContain(
      'Hidden reasoning tokens are not included where their usage was unavailable.',
    );
  });

  it('rejects impossible cache category totals', () => {
    expect(() =>
      observedSessionCost(model(), {
        requests: [{ inputTokens: 100, outputTokens: 20, cachedInputTokens: 80, cacheWriteTokens: 30 }],
      }),
    ).toThrow(/cannot exceed inputTokens/);
  });

  it('returns a zero-cost, zero-request result for an empty observed session', () => {
    expect(observedSessionCost(model(), { requests: [] })).toMatchObject({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      total: 0,
      warnings: [],
    });
  });
});
