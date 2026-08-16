import { describe, expect, it } from 'vitest';
import type { Model } from '@/lib/pricing/types';
import {
  DEFAULT_OPTIONS,
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
    expect(cost.inputCost + cost.cacheWriteCost + cost.outputCost).toBe(cost.total);
  });

  it('reports raw and reasoning-adjusted output tokens separately', () => {
    const cost = conversationCost(SONNET, WORKLOAD, { ...NO_CACHE, reasoningMultiplier: 2.5 });
    expect(cost.outputTokens).toBe(5_400);
    expect(cost.billedOutputTokens).toBe(13_500);
    expect(cost.assumptions.join(' ')).toMatch(/2.5×/);
  });

  it('assumes no caching unless asked — the headline carries no unrequested discount', () => {
    expect(DEFAULT_OPTIONS.cachedInputShare).toBe(0);
    const asked = conversationCost(SONNET, WORKLOAD, { cachedInputShare: 0.6 });
    const plain = conversationCost(SONNET, WORKLOAD);
    expect(plain.total).toBeGreaterThan(asked.total);
    expect(plain.cacheSavings).toBe(0);
  });

  it('applies the published cached rate to the cached share only', () => {
    const cost = conversationCost(SONNET, WORKLOAD, { cachedInputShare: 0.6 });
    const cached = Math.round(26_700 * 0.6);
    const fresh = 26_700 - cached;
    expect(cost.inputCost).toBeCloseTo((fresh * 3) / 1e6 + (cached * 0.3) / 1e6, 10);
    expect(cost.cacheSavings).toBeCloseTo(cost.inputCostUncached - cost.inputCost, 12);
    expect(cost.total).toBeCloseTo(0.117846, 6);
  });

  it('invents no discount when a provider publishes no cached rate', () => {
    // The old behaviour assumed 90% off, which is a real industry norm and an
    // entirely made-up number for any specific model. Charging full price and
    // saying so is the only defensible option.
    const cost = conversationCost(CHEAP, WORKLOAD, { cachedInputShare: 0.5 });
    const uncached = conversationCost(CHEAP, WORKLOAD, NO_CACHE);
    expect(cost.inputCost).toBeCloseTo(uncached.inputCost, 12);
    expect(cost.cacheSavings).toBeCloseTo(0, 12);
    expect(cost.assumptions.join(' ')).toMatch(/publishes no cached-input rate/);
  });

  it('discloses a separate cache-residency charge rather than hiding it', () => {
    const gemini = model({
      id: 'gemini',
      pricing: {
        input: 1.25,
        output: 10,
        cachedInput: 0.125,
        cacheStoragePerMillionTokenHour: 4.5,
      },
    });
    const cached = conversationCost(gemini, WORKLOAD, { cachedInputShare: 0.6 });
    expect(cached.warnings.join(' ')).toMatch(/\$4.5\/1M cached tokens\/hour/);
    expect(conversationCost(gemini, WORKLOAD, NO_CACHE).warnings).toEqual([]);
  });

  it('bills the cache write, so caching is not free', () => {
    // Both OpenAI and Anthropic charge 1.25x base input to write the cache.
    // Counting only the cheaper reads reports a saving the invoice will not.
    const withWrite = model({
      id: 'writes',
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
    });
    const cost = conversationCost(withWrite, WORKLOAD, { cachedInputShare: 0.6 });
    const prefix = Math.round((800 + 400) * 0.6);
    expect(cost.cacheWriteCost).toBeCloseTo((prefix * 3.75) / 1e6, 12);
    expect(cost.assumptions.join(' ')).toMatch(/One cache write per conversation/);

    const noWriteRate = conversationCost(SONNET, WORKLOAD, { cachedInputShare: 0.6 });
    expect(noWriteRate.cacheWriteCost).toBe(0);
    expect(noWriteRate.assumptions.join(' ')).toMatch(/Cache writes are not modelled/);
  });

  it('reports cache savings net of the write, not gross of it', () => {
    const withWrite = model({
      id: 'writes',
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
    });
    const cost = conversationCost(withWrite, WORKLOAD, { cachedInputShare: 0.6 });
    expect(cost.cacheSavings).toBeCloseTo(cost.inputCostUncached - cost.inputCost - cost.cacheWriteCost, 12);
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
    expect(tiny.exact).toBe(true);
  });

  it('sums the total in pico-dollars before converting to a float', () => {
    const exact = model({ id: 'exact-total', pricing: { input: 5, output: 30 } });
    const cost = conversationCost(
      exact,
      { systemTokens: 1_000, userTokens: 500, outputTokens: 800, turns: 3 },
      NO_CACHE,
    );
    expect(cost.total).toBe(0.114);
  });
});

describe('long-context tiers', () => {
  // OpenAI's GPT-5.x families bill the entire request at 2x input / 1.5x output
  // once it passes 272K input tokens. A flat rate understated those requests by
  // a factor of two.
  const TIERED = model({
    id: 'tiered',
    contextWindow: 1_050_000,
    pricing: {
      input: 5,
      output: 30,
      longContext: { thresholdTokens: 272_000, input: 10, output: 45 },
    },
  });

  it('leaves short requests on the standard rate', () => {
    const cost = conversationCost(TIERED, { ...WORKLOAD, turns: 1 }, NO_CACHE);
    expect(cost.longContextTurns).toBe(0);
    expect(cost.inputCost).toBeCloseTo((1200 * 5) / 1e6, 12);
  });

  it('switches the whole request to the tier once it crosses the threshold', () => {
    const big: Workload = { systemTokens: 300_000, userTokens: 0, outputTokens: 100, turns: 1 };
    const cost = conversationCost(TIERED, big, NO_CACHE);
    expect(cost.longContextTurns).toBe(1);
    expect(cost.inputCost).toBeCloseTo((300_000 * 10) / 1e6, 10);
    expect(cost.outputCost).toBeCloseTo((100 * 45) / 1e6, 12);
  });

  it('uses the long-context cache-write rate when the cached prefix starts above the threshold', () => {
    const tieredWrite = model({
      id: 'tiered-write',
      contextWindow: 1_050_000,
      pricing: {
        input: 5,
        output: 30,
        cachedInput: 0.5,
        cacheWrite: 6.25,
        longContext: {
          thresholdTokens: 272_000,
          input: 10,
          output: 45,
          cachedInput: 1,
          cacheWrite: 12.5,
        },
      },
    });
    const cost = conversationCost(
      tieredWrite,
      { systemTokens: 300_000, userTokens: 0, outputTokens: 100, turns: 1 },
      { cachedInputShare: 0.6 },
    );
    expect(cost.cacheWriteCost).toBe((180_000 * 12.5) / 1e6);
    expect(cost.assumptions.join(' ')).toContain('long-context write rate');
  });

  it('prices turn by turn, so a conversation can cross over partway through', () => {
    // Requests of 200k, 300k, 400k and 500k: only the first is under 272k.
    // Aggregating the conversation first and applying one rate would price all
    // four turns the same, which is wrong in both directions depending on size.
    const growing: Workload = { systemTokens: 100_000, userTokens: 100_000, outputTokens: 0, turns: 4 };
    const cost = conversationCost(TIERED, growing, NO_CACHE);
    expect(cost.longContextTurns).toBe(3);
    expect(cost.inputCost).toBeCloseTo((200_000 * 5 + (300_000 + 400_000 + 500_000) * 10) / 1e6, 8);
    expect(cost.assumptions.join(' ')).toMatch(/3 of 4 turns exceed/);
  });

  it('says so when a request is large and no tier is published', () => {
    const flat = model({ id: 'flat', contextWindow: 2_000_000, pricing: { input: 5, output: 30 } });
    const big: Workload = { systemTokens: 400_000, userTokens: 0, outputTokens: 100, turns: 1 };
    const cost = conversationCost(flat, big, NO_CACHE);
    expect(cost.assumptions.join(' ')).toMatch(/No long-context tier is published/);
  });
});

describe('scenarios that could not actually run', () => {
  it('warns when the largest turn does not fit the context window', () => {
    const small = model({ id: 'small', contextWindow: 8_000, pricing: { input: 1, output: 2 } });
    const cost = conversationCost(small, { ...WORKLOAD, turns: 20 }, NO_CACHE);
    expect(cost.warnings.join(' ')).toMatch(/context window/);
  });

  it('warns when the response exceeds the published output ceiling', () => {
    const capped = model({
      id: 'capped',
      contextWindow: 200_000,
      maxOutput: 4_000,
      pricing: { input: 1, output: 2 },
    });
    const cost = conversationCost(capped, { ...WORKLOAD, outputTokens: 9_000 }, NO_CACHE);
    expect(cost.warnings.join(' ')).toMatch(/output ceiling/);
  });

  it('stays silent for an ordinary scenario', () => {
    expect(conversationCost(SONNET, WORKLOAD, NO_CACHE).warnings).toEqual([]);
  });

  it('survives the largest scenario the URL decoder will accept', () => {
    // Every one of these is a value `decodeScenario` clamps to, so any shared
    // link can produce it. This used to throw a RangeError mid-render — with no
    // error boundary above it — and blank the whole application.
    //
    // Pricing per turn rather than in aggregate keeps even this inside the
    // exact-integer range: the biggest single multiplication is now one turn's
    // ~80M tokens, not the conversation's ~8 billion.
    const extreme: Workload = {
      systemTokens: 200_000,
      userTokens: 200_000,
      outputTokens: 200_000,
      turns: 200,
    };
    const dear = model({ id: 'dear', contextWindow: 200_000, pricing: { input: 60, output: 180 } });
    const cost = conversationCost(dear, extreme, NO_CACHE);
    expect(Number.isFinite(cost.total)).toBe(true);
    expect(cost.total).toBeGreaterThan(0);
    expect(cost.exact).toBe(true);
    // ...and it says the scenario is impossible rather than quietly pricing it.
    expect(cost.warnings.length).toBeGreaterThan(0);
  });

  it('degrades to inexact rather than throwing if the numbers ever do overflow', () => {
    const absurd: Workload = {
      systemTokens: Number.MAX_SAFE_INTEGER,
      userTokens: 0,
      outputTokens: 0,
      turns: 1,
    };
    const cost = conversationCost(SONNET, absurd, NO_CACHE);
    expect(Number.isFinite(cost.total)).toBe(true);
    expect(cost.exact).toBe(false);
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

  it('keeps promotional pricing through the end of its named UTC day', () => {
    expect(effectivePricing(introModel.pricing, new Date('2026-08-31T23:59:59.999Z')).input).toBe(2);
    expect(effectivePricing(introModel.pricing, new Date('2026-09-01T00:00:00.000Z')).input).toBe(3);
  });

  it('surfaces the promotion as an assumption in the cost breakdown', () => {
    const cost = conversationCost(introModel, WORKLOAD, {
      ...NO_CACHE,
      asOf: new Date('2026-08-01T00:00:00Z'),
    });
    expect(cost.assumptions.join(' ')).toMatch(/Promotional pricing/);
  });

  it('moves the cache rates with the promotion where the vendor publishes them', () => {
    const promoted = model({
      id: 'promoted',
      pricing: {
        input: 3,
        output: 15,
        cachedInput: 0.3,
        cacheWrite: 3.75,
        intro: { input: 2, output: 10, cachedInput: 0.2, cacheWrite: 2.5, until: '2026-08-31' },
      },
    });
    const during = effectivePricing(promoted.pricing, new Date('2026-08-01T00:00:00Z'));
    expect(during.cachedInput).toBe(0.2);
    expect(during.cacheWrite).toBe(2.5);

    const after = effectivePricing(promoted.pricing, new Date('2026-09-01T00:00:00Z'));
    expect(after.cachedInput).toBe(0.3);
    expect(after.cacheWrite).toBe(3.75);
  });

  it('leaves cache rates alone when the promotion does not mention them', () => {
    const during = effectivePricing(
      { input: 3, output: 15, cachedInput: 0.3, intro: { input: 2, output: 10, until: '2026-08-31' } },
      new Date('2026-08-01T00:00:00Z'),
    );
    // Erring high beats inventing a promoted cache rate the vendor never published.
    expect(during.cachedInput).toBe(0.3);
  });
});

describe('costAtScale', () => {
  const scale = { conversationsPerDay: 2500, monthlyActiveUsers: 1500, revenuePerUserPerMonth: 12 };

  it('projects a per-conversation cost out to day, month and year', () => {
    const scaled = costAtScale(0.117846, scale);
    expect(scaled.perDay).toBeCloseTo(294.615, 3);
    expect(scaled.perMonth).toBeCloseTo(8838.45, 2);
    expect(scaled.perYear).toBeCloseTo(106_061.4, 2);
    expect(scaled.perYear).toBeCloseTo(scaled.perMonth * 12, 10);
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
    expect(rows.every((row) => row.isCheapest)).toBe(true);
  });

  it('does not invent a finite multiple when the cheapest model is free', () => {
    const free = model({ id: 'free', pricing: { input: 0, output: 0 } });
    const rows = compareModels([SONNET, free], WORKLOAD, scale, NO_CACHE);
    expect(rows[0]!.multipleOfCheapest).toBe(1);
    expect(rows[1]!.multipleOfCheapest).toBeNull();
  });

  it('handles an empty selection without throwing', () => {
    expect(compareModels([], WORKLOAD, scale)).toEqual([]);
  });
});
