import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { buildPages, fitTitle } from './pages';

const ASOF = new Date('2026-08-02T00:00:00Z');

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId: 'openai',
    displayName: id,
    status: 'current',
    contextWindow: 400_000,
    maxOutput: 100_000,
    capabilityIndex: 70,
    pricing: { input: 1, output: 4 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-01', lastChanged: '2026-07-20' },
    ...overrides,
  };
}

function catalog(models: Model[]): PricingCatalog {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-08-02T02:00:00.000Z',
    providers: [
      { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.com/api/pricing/' },
      { id: 'anthropic', name: 'Anthropic', country: 'US' },
      { id: 'google', name: 'Google', country: 'US' },
    ],
    models,
  };
}

describe('buildPages', () => {
  it('gives every non-alias model a page at a distinct path', () => {
    const set = buildPages(catalog([model('gpt-5'), model('gpt-5-mini'), model('gpt-5-turbo')]), {
      asOf: ASOF,
    });

    expect(set.models.map((page) => page.path)).toEqual([
      '/models/gpt-5/',
      '/models/gpt-5-mini/',
      '/models/gpt-5-turbo/',
    ]);
    expect(new Set(set.all.map((page) => page.path)).size).toBe(set.all.length);
  });

  it('leaves routing aliases without a page of their own', () => {
    // Two URLs for one purchasable model would compete with each other, and
    // the alias is listed on the model it routes to instead.
    const set = buildPages(catalog([model('gpt-5.6-sol'), model('gpt-5.6', { aliasOf: 'gpt-5.6-sol' })]), {
      asOf: ASOF,
    });

    expect(set.models).toHaveLength(1);
    expect(set.models[0]!.id).toBe('gpt-5.6-sol');
    expect(set.models[0]!.aliases.map((m) => m.id)).toEqual(['gpt-5.6']);
  });

  it('omits a model upstream has stopped listing', () => {
    const set = buildPages(
      catalog([
        model('gpt-5'),
        model('gpt-4', { provenance: { source: 'vendor', lastVerified: '2026-08-01', stale: true } }),
      ]),
      { asOf: ASOF },
    );

    expect(set.models.map((page) => page.id)).toEqual(['gpt-5']);
  });

  it('costs each workload with the same engine the calculator uses', () => {
    // 6 turns of an 800-token system prompt, 400-token questions and 900-token
    // answers is 26,700 input and 5,400 output tokens. At $1/$4 per 1M that is
    // $0.0267 + $0.0216 = $0.0483 a conversation, and 2,500 a day for 30 days
    // is $3,622.50.
    const set = buildPages(catalog([model('gpt-5')]), { asOf: ASOF });
    const chatbot = set.models[0]!.examples[0]!;

    expect(chatbot.profile.id).toBe('chatbot');
    expect(chatbot.inputTokens).toBe(26_700);
    expect(chatbot.outputTokens).toBe(5_400);
    expect(chatbot.perConversation).toBeCloseTo(0.0483, 6);
    expect(chatbot.perMonth).toBeCloseTo(3_622.5, 4);
  });

  it('carries the engine warning when a workload cannot fit the context window', () => {
    const set = buildPages(catalog([model('tiny', { contextWindow: 8_000 })]), { asOf: ASOF });
    const warnings = set.models[0]!.examples.flatMap((example) => example.warnings);

    expect(warnings.join(' ')).toMatch(/context window/);
  });

  it('applies promotional pricing that is still in force, and not once it lapses', () => {
    const promo = model('promo', {
      pricing: { input: 1, output: 4, intro: { input: 0.5, output: 2, until: '2026-08-31' } },
    });

    const during = buildPages(catalog([promo]), { asOf: new Date('2026-08-02T00:00:00Z') });
    expect(during.models[0]!.promotional).toBe(true);
    expect(during.models[0]!.effective.input).toBe(0.5);

    const after = buildPages(catalog([promo]), { asOf: new Date('2026-09-30T00:00:00Z') });
    expect(after.models[0]!.promotional).toBe(false);
    expect(after.models[0]!.effective.input).toBe(1);
  });

  it('ranks by blended rate, cheapest first', () => {
    const set = buildPages(
      catalog([
        model('dear', { pricing: { input: 10, output: 40 } }),
        model('cheap', { pricing: { input: 0.1, output: 0.4 } }),
        model('middle', { pricing: { input: 1, output: 4 } }),
      ]),
      { asOf: ASOF },
    );

    const byId = new Map(set.models.map((page) => [page.id, page.rank]));
    expect(byId.get('cheap')).toMatchObject({ position: 1, total: 3 });
    expect(byId.get('middle')).toMatchObject({ position: 2, total: 3 });
    expect(byId.get('dear')).toMatchObject({ position: 3, total: 3 });
  });

  it('separates "cheaper and at least as capable" from merely "cheaper"', () => {
    const set = buildPages(
      catalog([
        model('dear', { pricing: { input: 10, output: 40 }, capabilityIndex: 80 }),
        model('bargain', { pricing: { input: 1, output: 4 }, capabilityIndex: 85 }),
        model('weak', { pricing: { input: 0.1, output: 0.4 }, capabilityIndex: 30 }),
      ]),
      { asOf: ASOF },
    );

    const dear = set.models.find((page) => page.id === 'dear')!;
    expect(dear.alternativesAreComparable).toBe(true);
    // Only `bargain` is both cheaper and scored at least as highly; `weak` is
    // cheaper and materially worse, which is a different claim.
    expect(dear.alternatives.map((a) => a.model.id)).toEqual(['bargain']);
    expect(dear.alternatives[0]!.saving).toBeCloseTo(0.9, 6);

    const bargain = set.models.find((page) => page.id === 'bargain')!;
    expect(bargain.alternativesAreComparable).toBe(false);
    expect(bargain.alternatives.map((a) => a.model.id)).toEqual(['weak']);
  });

  it('only pairs models from different providers', () => {
    const set = buildPages(
      catalog([
        model('gpt-5', { providerId: 'openai' }),
        model('gpt-5-mini', { providerId: 'openai' }),
        model('claude', { providerId: 'anthropic' }),
      ]),
      { asOf: ASOF },
    );

    expect(set.comparisons).toHaveLength(2);
    for (const page of set.comparisons) {
      expect(page.left.providerId).not.toBe(page.right.providerId);
    }
  });

  it('will not pair models more than 3x apart on blended rate', () => {
    const set = buildPages(
      catalog([
        model('frontier', { providerId: 'openai', pricing: { input: 15, output: 60 } }),
        model('flash', { providerId: 'google', pricing: { input: 0.1, output: 0.4 } }),
      ]),
      { asOf: ASOF },
    );

    expect(set.comparisons).toEqual([]);
  });

  it('reports how many pairs the ceiling dropped rather than truncating quietly', () => {
    const models = [
      model('a', { providerId: 'openai' }),
      model('b', { providerId: 'anthropic' }),
      model('c', { providerId: 'google' }),
    ];
    const set = buildPages(catalog(models), { asOf: ASOF, maxComparisons: 1 });

    expect(set.comparisons).toHaveLength(1);
    expect(set.droppedComparisons).toBe(2);
  });

  it('puts the two halves of a comparison in the same order as its URL', () => {
    const set = buildPages(
      catalog([model('zeta', { providerId: 'openai' }), model('alpha', { providerId: 'anthropic' })]),
      { asOf: ASOF },
    );

    const page = set.comparisons[0]!;
    expect(page.slug).toBe('alpha-vs-zeta');
    expect(page.left.id).toBe('alpha');
    expect(page.right.id).toBe('zeta');
  });

  it('says plainly when neither model wins on every workload', () => {
    // Cheap input and dear output against the reverse. The chatbot writes
    // enough to favour `writer`; the input-heavy summariser flips to `reader`.
    const set = buildPages(
      catalog([
        model('reader', { providerId: 'openai', pricing: { input: 0.1, output: 30 } }),
        model('writer', { providerId: 'anthropic', pricing: { input: 5, output: 1 } }),
      ]),
      { asOf: ASOF },
    );

    expect(set.comparisons[0]!.verdict).toMatch(/Neither is cheaper everywhere/);
  });

  it('drops a provider with no pageable models instead of publishing an empty table', () => {
    const set = buildPages(catalog([model('gpt-5', { providerId: 'openai' })]), { asOf: ASOF });
    expect(set.providers.map((page) => page.id)).toEqual(['openai']);
  });

  it('keeps every title inside what a search result will show', () => {
    const set = buildPages(
      catalog([model('a-very-long-model-identifier-indeed', { displayName: 'A Very Long Model Name' })]),
      { asOf: ASOF },
    );

    for (const page of set.all) {
      expect(page.title.length).toBeLessThanOrEqual(70);
      expect(page.description.length).toBeLessThanOrEqual(160);
    }
  });
});

describe('fitTitle', () => {
  it('takes the first candidate that fits', () => {
    expect(fitTitle(['x'.repeat(80), 'short'], 70)).toBe('short');
  });

  it('truncates the last candidate rather than returning something too long', () => {
    expect(fitTitle(['x'.repeat(80)], 10)).toHaveLength(10);
  });
});
