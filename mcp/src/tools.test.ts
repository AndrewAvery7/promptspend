import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Catalog } from '@/lib/pricing/catalog';
import { SERVER_INFO } from './schema';
import { compareModels } from '@/lib/engine/cost';
import type { PricingCatalog } from '@/lib/pricing/types';
import { estimateCost, findCheaper, getPrice, resolveModel } from './tools';
import { provenanceOf } from './provenance';

/**
 * A catalog small enough to reason about, exercising every provenance state the
 * real one contains: a hand-verified row, a disputed one, and one upstream has
 * stopped listing.
 */
const RAW: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-03T02:00:00.000Z',
  providers: [
    { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.example/pricing' },
    { id: 'deepseek', name: 'DeepSeek', country: 'CN', pricingUrl: 'https://deepseek.example/pricing' },
  ],
  models: [
    {
      id: 'gpt-test-pro',
      providerId: 'openai',
      displayName: 'GPT Test Pro',
      status: 'current',
      contextWindow: 400_000,
      maxOutput: 100_000,
      pricing: { input: 10, output: 40, cachedInput: 1, cacheWrite: 12.5 },
      tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
      capabilities: { reasoning: true, vision: true },
      capabilityIndex: 95,
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-01',
        lastChanged: '2026-07-15',
        verifiedUrl: 'https://openai.example/pricing',
      },
    },
    {
      id: 'gpt-test-mini',
      providerId: 'openai',
      displayName: 'GPT Test Mini',
      status: 'current',
      contextWindow: 200_000,
      pricing: { input: 0.5, output: 2 },
      tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
      capabilities: { reasoning: false, vision: false },
      capabilityIndex: 80,
      provenance: { source: 'litellm', lastVerified: '2026-08-02' },
    },
    {
      id: 'deepseek-test-v9',
      providerId: 'deepseek',
      displayName: 'DeepSeek Test V9',
      status: 'current',
      contextWindow: 128_000,
      pricing: { input: 0.28, output: 0.4 },
      tokenizer: { kind: 'approx', charsPerToken: 3.5, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: false, vision: false },
      capabilityIndex: 82,
      provenance: {
        source: 'openrouter',
        lastVerified: '2026-08-02',
        needsReview: true,
        reviewNote: 'OpenRouter disagrees by 33%: $0.28/$0.40 vs $0.21/$0.30',
      },
    },
    {
      id: 'legacy-test-one',
      providerId: 'openai',
      displayName: 'Legacy Test One',
      status: 'legacy',
      contextWindow: 8_000,
      pricing: { input: 30, output: 60 },
      tokenizer: { kind: 'tiktoken', encoding: 'cl100k_base' },
      capabilities: { reasoning: false, vision: false },
      provenance: { source: 'litellm', lastVerified: '2026-06-01', stale: true },
    },
    {
      // A model inside a promotional window, which the real catalog has had
      // since Claude Sonnet 5's introductory pricing landed.
      id: 'promo-test-one',
      providerId: 'openai',
      displayName: 'Promo Test One',
      status: 'current',
      contextWindow: 200_000,
      pricing: {
        input: 3,
        output: 15,
        cachedInput: 0.3,
        intro: { input: 2, output: 10, cachedInput: 0.2, until: '2026-08-31' },
      },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      capabilityIndex: 90,
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-01',
        verifiedUrl: 'https://openai.example/pricing',
      },
    },
  ],
};

const catalog = new Catalog(RAW);
const AT = RAW.generatedAt;

/** Every price-bearing object anywhere in a response, at any depth. */
function pricedNodes(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) pricedNodes(item, found);
  } else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    const namesAPrice =
      'input_per_million_usd' in node || 'cost_per_month_usd' in node || 'saves_per_month_usd' in node;
    if (namesAPrice) found.push(node);
    for (const child of Object.values(node)) pricedNodes(child, found);
  }
  return found;
}

describe('provenance is structural, not optional', () => {
  /**
   * This is the differentiator. Every competing pricing server returns a bare
   * number; the whole argument for this one is that it cannot. If a refactor
   * ever lets a price out without its source and date, the product is gone and
   * this test is the thing that notices.
   */
  it('attaches provenance to every price any tool returns', () => {
    const responses = [
      getPrice(catalog, AT, 'gpt-test-pro'),
      estimateCost(catalog, AT, { models: ['gpt-test-pro', 'gpt-test-mini', 'deepseek-test-v9'] }),
      findCheaper(catalog, AT, { model: 'gpt-test-pro', min_capability: 75 }),
    ];

    for (const response of responses) {
      const nodes = pricedNodes(response);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(
          node.provenance,
          `a price was returned without provenance: ${JSON.stringify(node)}`,
        ).toBeDefined();
        const p = node.provenance as Record<string, unknown>;
        expect(typeof p.last_verified).toBe('string');
        expect(typeof p.source).toBe('string');
        expect(typeof p.confidence).toBe('string');
        expect(typeof p.disputed).toBe('boolean');
      }
    }
  });

  it('says plainly when a price is disputed rather than quietly returning it', () => {
    const result = getPrice(catalog, AT, 'deepseek-test-v9') as Record<string, unknown>;
    const p = result.provenance as Record<string, unknown>;
    expect(p.disputed).toBe(true);
    expect(String(p.confidence)).toContain('DISPUTED');
    expect(String(p.dispute_note)).toContain('33%');
  });

  it('flags a row upstream has stopped listing', () => {
    const p = provenanceOf(RAW.models[3]!);
    expect(p.upstream_stale).toBe(true);
    expect(p.confidence).toContain('stopped listing');
  });

  it('warns that a router price is a resale price', () => {
    const p = provenanceOf(RAW.models[2]!);
    expect(p.source_description).toContain('resale');
  });
});

describe('estimate_cost — the thing a price lookup cannot answer', () => {
  it('bills conversation history compounding, not just one exchange', () => {
    const single = estimateCost(catalog, AT, { models: ['gpt-test-pro'], turns: 1 }) as never;
    const four = estimateCost(catalog, AT, { models: ['gpt-test-pro'], turns: 4 }) as never;
    const one = (single as { results: { cost_per_conversation_usd: number }[] }).results[0]!;
    const many = (four as { results: { cost_per_conversation_usd: number }[] }).results[0]!;
    // Four turns re-send earlier turns, so cost grows faster than 4x a single turn.
    expect(many.cost_per_conversation_usd).toBeGreaterThan(one.cost_per_conversation_usd * 4);
  });

  it('agrees exactly with the engine the website runs', () => {
    // The claim in the README is that this server cannot disagree with the site.
    // That is only true while it calls the same function - so assert it does,
    // rather than trusting that it still imports it.
    const models = catalog.getAll(['gpt-test-pro', 'gpt-test-mini']);
    const expected = compareModels(
      models,
      { systemTokens: 800, userTokens: 150, outputTokens: 350, turns: 4 },
      { conversationsPerDay: 1000, monthlyActiveUsers: 1000, revenuePerUserPerMonth: 0 },
      { cachedInputShare: 0, reasoningMultiplier: 1, useBatchApi: false },
    );
    const actual = estimateCost(catalog, AT, {
      models: ['gpt-test-pro', 'gpt-test-mini'],
    }) as { results: { model: string; cost_per_month_usd: number }[] };

    for (const row of expected) {
      const got = actual.results.find((r) => r.model === row.model.id)!;
      expect(got.cost_per_month_usd).toBeCloseTo(Number(row.scaled.perMonth.toFixed(2)), 2);
    }
  });

  it('ranks cheapest first and reports the multiple', () => {
    const r = estimateCost(catalog, AT, {
      models: ['gpt-test-pro', 'deepseek-test-v9'],
    }) as { results: { model: string; is_cheapest: boolean; multiple_of_cheapest: number }[] };
    expect(r.results[0]!.model).toBe('deepseek-test-v9');
    expect(r.results[0]!.is_cheapest).toBe(true);
    expect(r.results[1]!.multiple_of_cheapest).toBeGreaterThan(1);
  });

  it('reports unknown models instead of silently dropping them', () => {
    const r = estimateCost(catalog, AT, {
      models: ['gpt-test-pro', 'not-a-real-model-xyz'],
    }) as { unknown_models?: string[] };
    expect(r.unknown_models).toEqual(['not-a-real-model-xyz']);
  });

  it('errors rather than guessing when nothing resolves', () => {
    const r = estimateCost(catalog, AT, { models: ['nonsense'] }) as { error?: string };
    expect(r.error).toBeDefined();
  });
});

describe('find_cheaper', () => {
  it('only offers models at or above the capability bar', () => {
    const r = findCheaper(catalog, AT, { model: 'gpt-test-pro' }) as {
      alternatives: { model: string; capability_index: number | null }[];
    };
    // The bar defaults to gpt-test-pro's own 95; nothing else reaches it.
    expect(r.alternatives).toHaveLength(0);
  });

  it('finds savings once the bar is lowered, and quantifies them', () => {
    const r = findCheaper(catalog, AT, { model: 'gpt-test-pro', min_capability: 80 }) as {
      alternatives: { model: string; saves_per_month_usd: number; saves_per_year_usd: number }[];
    };
    expect(r.alternatives.length).toBeGreaterThan(0);
    for (const alt of r.alternatives) {
      expect(alt.saves_per_month_usd).toBeGreaterThan(0);
      expect(alt.saves_per_year_usd).toBeCloseTo(alt.saves_per_month_usd * 12, 1);
    }
  });

  it('never presents a cheaper model as a decision', () => {
    const r = findCheaper(catalog, AT, { model: 'gpt-test-pro', min_capability: 80 }) as {
      caveat: string;
    };
    expect(r.caveat).toContain('TEST');
    expect(r.caveat).toContain('not a benchmark');
  });

  it('excludes legacy and upstream-stale rows from suggestions', () => {
    const r = findCheaper(catalog, AT, { model: 'gpt-test-pro', min_capability: 0 }) as {
      alternatives: { model: string }[];
    };
    expect(r.alternatives.map((a) => a.model)).not.toContain('legacy-test-one');
  });
});

describe('model resolution is tolerant of how people actually type', () => {
  it.each([
    ['gpt-test-pro', 'gpt-test-pro'],
    ['GPT Test Pro', 'gpt-test-pro'],
    ['gpt test pro', 'gpt-test-pro'],
    ['  gpt-test-pro  ', 'gpt-test-pro'],
  ])('resolves %j', (query, expected) => {
    expect(resolveModel(catalog, query)?.id).toBe(expected);
  });

  it('suggests alternatives instead of a bare failure', () => {
    const r = getPrice(catalog, AT, 'gpt-does-not-exist') as { did_you_mean?: string[] };
    expect(r.did_you_mean).toContain('gpt-test-pro');
  });

  it.each(['', ' ', '-', '_'])('refuses a degenerate model query %j', (query) => {
    expect(resolveModel(catalog, query)).toBeUndefined();
    expect(getPrice(catalog, AT, query)).toHaveProperty('error');
  });
});

describe('tool argument validation', () => {
  it('requires a bounded model array', () => {
    expect(estimateCost(catalog, AT, { models: 'gpt-test-pro' } as never)).toHaveProperty('error');
    expect(estimateCost(catalog, AT, { models: [] })).toHaveProperty('error');
    expect(estimateCost(catalog, AT, { models: Array(21).fill('gpt-test-pro') })).toHaveProperty('error');
  });

  it.each([
    { models: ['gpt-test-pro'], system_tokens: Number.NaN },
    { models: ['gpt-test-pro'], output_tokens: Number.POSITIVE_INFINITY },
    { models: ['gpt-test-pro'], turns: -1 },
    { models: ['gpt-test-pro'], conversations_per_day: -1 },
    { models: ['gpt-test-pro'], cached_input_share: 1.1 },
    { models: ['gpt-test-pro'], reasoning_multiplier: 6 },
  ])('rejects unsafe numeric input %#', (input) => {
    expect(estimateCost(catalog, AT, input)).toHaveProperty('error');
  });
});

describe('the caveats the site publishes travel with the numbers', () => {
  it('states what list prices exclude', () => {
    const r = getPrice(catalog, AT, 'gpt-test-pro') as { note: string };
    expect(r.note).toContain('regional');
    expect(r.note).toContain('negotiated');
  });

  it('explains the compounding-history trap in the workload echo', () => {
    const r = estimateCost(catalog, AT, { models: ['gpt-test-pro'] }) as {
      workload: { note: string };
    };
    expect(r.workload.note).toContain('re-sends');
  });

  it('stamps every response with the catalog it priced against', () => {
    for (const r of [
      getPrice(catalog, AT, 'gpt-test-pro'),
      estimateCost(catalog, AT, { models: ['gpt-test-pro'] }),
      findCheaper(catalog, AT, { model: 'gpt-test-pro', min_capability: 80 }),
    ] as Record<string, unknown>[]) {
      expect(r.catalog_generated_at).toBe(AT);
    }
  });
});

describe('the server describes itself accurately', () => {
  // 0.1.2 shipped announcing 0.1.1, from `--version` and from the MCP
  // handshake's serverInfo. The package version had been bumped and the
  // literal in schema.ts had not, and every gate passed because not one of
  // them compared the two. A client that trusts serverInfo has no way to
  // notice, which is what makes it worth a test rather than a convention.
  it('reports the version it was actually published as', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(SERVER_INFO.version).toBe(pkg.version);
  });
});

describe('a promotional rate is the rate', () => {
  // get_price read `pricing.input` while estimate_cost billed through the
  // engine, which honours promotional windows. So on 2026-08-06 the two tools
  // disagreed about Claude Sonnet 5 on the same day: get_price quoted $3/$15,
  // the September rate, while estimate_cost billed a million tokens at $2 —
  // and get_price stamped its answer "confirmed against the provider's own
  // pricing page". Wrong is recoverable; wrong with a confidence claim is not.
  const INSIDE = new Date('2026-08-06T00:00:00Z');
  const AFTER = new Date('2026-09-01T00:00:00Z');

  it('quotes the promoted rate while the promotion is running', () => {
    const r = getPrice(catalog, AT, 'promo-test-one', INSIDE) as Record<string, unknown>;
    expect(r.input_per_million_usd).toBe(2);
    expect(r.output_per_million_usd).toBe(10);
    expect(r.cached_input_per_million_usd).toBe(0.2);
  });

  it('says the standard rate and when the promotion lapses', () => {
    const r = getPrice(catalog, AT, 'promo-test-one', INSIDE) as Record<string, unknown>;
    const promo = r.promotional_pricing as Record<string, unknown>;
    expect(promo).toBeDefined();
    expect(promo.in_force_until).toBe('2026-08-31');
    expect(promo.standard_input_per_million_usd).toBe(3);
    expect(promo.standard_output_per_million_usd).toBe(15);
  });

  it('reverts to the standard rate once the promotion has lapsed', () => {
    const r = getPrice(catalog, AT, 'promo-test-one', AFTER) as Record<string, unknown>;
    expect(r.input_per_million_usd).toBe(3);
    expect(r.output_per_million_usd).toBe(15);
    expect(r.promotional_pricing).toBeUndefined();
  });

  it('leaves a model with no promotion untouched', () => {
    const r = getPrice(catalog, AT, 'gpt-test-pro', INSIDE) as Record<string, unknown>;
    expect(r.input_per_million_usd).toBe(10);
    expect(r.promotional_pricing).toBeUndefined();
  });

  // The guard that matters: the two tools must not be able to disagree again.
  it('quotes the same input rate that estimate_cost bills', () => {
    const quoted = getPrice(catalog, AT, 'promo-test-one', INSIDE) as Record<string, unknown>;
    const billed = estimateCost(catalog, AT, {
      models: ['promo-test-one'],
      system_tokens: 200_000,
      user_tokens: 0,
      output_tokens: 0,
      turns: 1,
      conversations_per_day: 1,
    }) as Record<string, unknown>;
    const row = (billed.results as Record<string, unknown>[])[0]!;
    // 200k input tokens, nothing else — cost per conversation is one fifth
    // of the per-million input rate, in dollars.
    expect(row.cost_per_conversation_usd).toBe(
      Number((Number(quoted.input_per_million_usd) * 0.2).toFixed(6)),
    );
  });
});
