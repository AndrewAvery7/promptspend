import { describe, expect, it } from 'vitest';
import type { Model } from '@/lib/pricing/types';
import {
  ASSUMED_CACHE_MULTIPLIER,
  compareModels,
  conversationCost,
  costAtScale,
  effectivePricing,
  sessionTokens,
  type Workload,
} from './cost';

function model(overrides: Partial<Model> & { id: string; pricing: Model['pricing'] }): Model {
  return {
    providerId: 'test',
    displayName: overrides.id,
    status: 'current',
    contextWindow: 200_000,
    tokenizer: { kind: 'approx', charsPerToken: 3.8, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    ...overrides,
  };
}

const SONNET = model({
  id: 'sonnet',
  displayName: 'Sonnet',
  pricing: { input: 3, output: 15, cachedInput: 0.3 },
});
const CHEAP = model({ id: 'cheap', displayName: 'Cheap', pricing: { input: 0.28, output: 0.4 } });

const WORKLOAD: Workload = { systemTokens: 800, userTokens: 400, outputTokens: 900, turns: 6 };
const NO_CACHE = { cachedInputShare: 0 };

describe('sessionTokens', () => {
  it('bills the system prompt and user message once per turn', () => {
    const tokens = sessionTokens({ ...WORKLOAD, turns: 1 });
    expect(tokens.inputTokens).toBe(1200);
    expect(tokens.outputTokens).toBe(900);
    expect(tokens.historyTokens).toBe(0);
  });

  it('re-sends prior turns as input, so history dominates a long conversation', () => {
    // 6 turns: 6*(800+400) input for the fresh parts, plus 15 history pairs of
    // (400 + 900) that get resent.
    const tokens = sessionTokens(WORKLOAD);
    expect(tokens.inputTokens).toBe(26_700);
    expect(tokens.outputTokens).toBe(5_400);
    expect(tokens.historyTokens).toBe(19_500);
  });

  it('grows history quadratically — doubling turns more than doubles input', () => {
    const six = sessionTokens({ ...WORKLOAD, turns: 6 }).inputTokens;
    const twelve = sessionTokens({ ...WORKLOAD, turns: 12 }).inputTokens;
    expect(twelve).toBeGreaterThan(six * 2.5);
  });

  it('treats a fractional or zero turn count as one turn', () => {
    expect(sessionTokens({ ...WORKLOAD, turns: 0 }).inputTokens).toBe(1200);
    expect(sessionTokens({ ...WORKLOAD, turns: 1.7 }).inputTokens).toBe(1200);
  });
});

describe('conversationCost', () => {
  it('prices input and output at their own rates — never an average', () => {
    const cost = conversationCost(SONNET, WORKLOAD, NO_CACHE);
    expect(cost.inputCost).toBeCloseTo((26_700 * 3) / 1e6, 10);
    expect(cost.outputCost).toBeCloseTo((5_400 * 15) / 1e6, 10);
    expect(cost.total).toBeCloseTo(0.0801 + 0.081, 10);
  });

  it('parts always sum to the total', () => {
    const cost = conversationCost(SONNET, WORKLOAD, { cachedInputShare: 0.6 });
    expect(cost.inputCost + cost.outputCost).toBe(cost.total);
  });

  it('applies the published cached rate to the cached share only', () => {
    const cost = conversationCost(SONNET, WORKLOAD, { cachedInputShare: 0.6 });
    const cached = Math.round(26_700 * 0.6);
    const fresh = 26_700 - cached;
    expect(cost.inputCost).toBeCloseTo((fresh * 3) / 1e6 + (cached * 0.3) / 1e6, 10);
    expect(cost.cacheSavings).toBeCloseTo(cost.inputCostUncached - cost.inputCost, 12);
    expect(cost.total).toBeCloseTo(0.117846, 6);
  });

  it('falls back to an assumed cache discount and says so when none is published', () => {
    const cost = conversationCost(CHEAP, WORKLOAD, { cachedInputShare: 0.5 });
    const cached = Math.round(26_700 * 0.5);
    const fresh = 26_700 - cached;
    expect(cost.inputCost).toBeCloseTo(
      (fresh * 0.28) / 1e6 + (cached * 0.28 * ASSUMED_CACHE_MULTIPLIER) / 1e6,
      10,
    );
    expect(cost.assumptions.join(' ')).toMatch(/No published cached-input rate/);
  });

  it('never claims a cache assumption when caching is switched off', () => {
    const cost = conversationCost(CHEAP, WORKLOAD, NO_CACHE);
    expect(cost.cacheSavings).toBe(0);
    expect(cost.assumptions).toHaveLength(0);
  });

  it('bills hidden reasoning tokens at the output rate', () => {
    const plain = conversationCost(SONNET, WORKLOAD, NO_CACHE);
    const thinking = conversationCost(SONNET, WORKLOAD, { ...NO_CACHE, reasoningMultiplier: 3 });
    expect(thinking.outputCost).toBeCloseTo(plain.outputCost * 3, 10);
    expect(thinking.inputCost).toBeCloseTo(plain.inputCost, 12);
    expect(thinking.assumptions.join(' ')).toMatch(/reasoning/);
  });

  it('applies a batch discount only where the provider publishes one', () => {
    const batched = model({
      id: 'batched',
      pricing: { input: 3, output: 15, batchDiscount: 0.5 },
    });
    const withBatch = conversationCost(batched, WORKLOAD, { ...NO_CACHE, useBatchApi: true });
    const without = conversationCost(batched, WORKLOAD, NO_CACHE);
    expect(withBatch.total).toBeCloseTo(without.total / 2, 10);

    const unsupported = conversationCost(CHEAP, WORKLOAD, { ...NO_CACHE, useBatchApi: true });
    expect(unsupported.assumptions.join(' ')).toMatch(/no batch discount/);
  });

  it('is exact enough that a tiny request does not produce float noise', () => {
    const tiny = conversationCost(
      CHEAP,
      { systemTokens: 100, userTokens: 0, outputTokens: 0, turns: 1 },
      NO_CACHE,
    );
    expect(tiny.total).toBe(0.000028);
  });
});

describe('effectivePricing', () => {
  const introModel = model({
    id: 'intro',
    pricing: { input: 3, output: 15, intro: { input: 2, output: 10, until: '2026-08-31' } },
  });

  it('uses promotional rates while the window is open', () => {
    const pricing = effectivePricing(introModel.pricing, new Date('2026-08-01T00:00:00Z'));
    expect(pricing.input).toBe(2);
    expect(pricing.output).toBe(10);
  });

  it('reverts to list rates once the window closes', () => {
    const pricing = effectivePricing(introModel.pricing, new Date('2026-09-01T00:00:00Z'));
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });

  it('surfaces the promotion as an assumption in the cost breakdown', () => {
    const cost = conversationCost(introModel, WORKLOAD, {
      ...NO_CACHE,
      asOf: new Date('2026-08-01T00:00:00Z'),
    });
    expect(cost.assumptions.join(' ')).toMatch(/Promotional pricing/);
  });
});

describe('costAtScale', () => {
  const scale = { conversationsPerDay: 2500, monthlyActiveUsers: 1500, revenuePerUserPerMonth: 12 };

  it('projects a per-conversation cost out to day, month and year', () => {
    const scaled = costAtScale(0.117846, scale);
    expect(scaled.perDay).toBeCloseTo(294.615, 3);
    expect(scaled.perMonth).toBeCloseTo(8838.45, 2);
    expect(scaled.perYear).toBeCloseTo(107_534.475, 2);
  });

  it('derives cost per user and margin from revenue', () => {
    const scaled = costAtScale(0.117846, scale);
    expect(scaled.costPerUser).toBeCloseTo(5.8923, 4);
    expect(scaled.margin).toBeCloseTo((12 - 5.8923) / 12, 6);
  });

  it('reports a negative margin rather than hiding it', () => {
    const scaled = costAtScale(1, { ...scale, revenuePerUserPerMonth: 1 });
    expect(scaled.margin).not.toBeNull();
    expect(scaled.margin!).toBeLessThan(0);
  });

  it('returns a null margin when no revenue is supplied', () => {
    const scaled = costAtScale(0.1, { ...scale, revenuePerUserPerMonth: 0 });
    expect(scaled.margin).toBeNull();
    expect(scaled.breakEvenConversationsPerDay).toBeNull();
  });

  it('computes the volume at which AI cost consumes all revenue', () => {
    const scaled = costAtScale(0.117846, scale);
    // 1500 users x $12 = $18,000/month of revenue.
    expect(scaled.breakEvenConversationsPerDay).toBeCloseTo(18_000 / (0.117846 * 30), 2);
  });
});

describe('compareModels', () => {
  const scale = { conversationsPerDay: 2500, monthlyActiveUsers: 1500, revenuePerUserPerMonth: 12 };

  it('sorts cheapest first and marks it', () => {
    const rows = compareModels([SONNET, CHEAP], WORKLOAD, scale, NO_CACHE);
    expect(rows.map((row) => row.model.id)).toEqual(['cheap', 'sonnet']);
    expect(rows[0]!.isCheapest).toBe(true);
    expect(rows[1]!.isCheapest).toBe(false);
  });

  it('reports the premium over the cheapest option', () => {
    const rows = compareModels([SONNET, CHEAP], WORKLOAD, scale, NO_CACHE);
    expect(rows[0]!.deltaPerMonth).toBe(0);
    expect(rows[1]!.deltaPerMonth).toBeCloseTo(rows[1]!.scaled.perMonth - rows[0]!.scaled.perMonth, 8);
    expect(rows[1]!.multipleOfCheapest).toBeGreaterThan(1);
  });

  it('is stable when two models cost exactly the same', () => {
    const twin = model({ id: 'a-twin', pricing: { input: 3, output: 15, cachedInput: 0.3 } });
    const rows = compareModels([SONNET, twin], WORKLOAD, scale, NO_CACHE);
    expect(rows[0]!.model.id).toBe('a-twin');
    expect(rows[1]!.deltaPerMonth).toBeCloseTo(0, 10);
  });

  it('handles an empty selection without throwing', () => {
    expect(compareModels([], WORKLOAD, scale)).toEqual([]);
  });
});
