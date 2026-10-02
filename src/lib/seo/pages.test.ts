import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { buildPages, fitTitle, ledgerPages, pairDifferences } from './pages';
import { updateLedger, type PageLedger } from './ledger';

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

/** The same catalog, as the sync would publish it on a later morning. */
function catalogOn(models: Model[], day: string): PricingCatalog {
  return { ...catalog(models), generatedAt: `${day}T11:00:00.000Z` };
}

/** What `check-pages.ts --fix` does: build, then record what was built. */
function record(raw: PricingCatalog, ledger: PageLedger = {}): PageLedger {
  const asOf = new Date(raw.generatedAt);
  return updateLedger(ledger, ledgerPages(buildPages(raw, { asOf, ledger })), raw.generatedAt.slice(0, 10));
}

function lastmods(raw: PricingCatalog, ledger: PageLedger): Record<string, string> {
  const set = buildPages(raw, { asOf: new Date(raw.generatedAt), ledger });
  return Object.fromEntries(set.all.map((page) => [page.path, page.lastmod]));
}

const TRIO = [
  model('gpt-5', { providerId: 'openai' }),
  model('claude-opus-5', { providerId: 'anthropic' }),
  model('gemini-3-pro', { providerId: 'google' }),
];

describe('sitemap lastmod', () => {
  it('is the build date for every page when nothing has been recorded', () => {
    const set = buildPages(catalog(TRIO), { asOf: ASOF });
    expect(new Set(set.all.map((page) => page.lastmod))).toEqual(new Set(['2026-08-02']));
  });

  it('does not move when a later morning re-verifies the same prices', () => {
    // The sync moves `generatedAt` and every `lastVerified` daily. Neither is a
    // change to any page, and neither may reach the sitemap.
    const ledger = record(catalogOn(TRIO, '2026-08-02'));
    const reverified = TRIO.map((m) => ({
      ...m,
      provenance: { ...m.provenance, lastVerified: '2026-09-30' },
    }));

    const later = lastmods(catalogOn(reverified, '2026-09-30'), ledger);
    expect(new Set(Object.values(later))).toEqual(new Set(['2026-08-02']));
    expect(later).toEqual(lastmods(catalogOn(TRIO, '2026-08-02'), ledger));
  });

  it('moves for the page whose rates changed and the pages that show them, and no others', () => {
    const ledger = record(catalogOn(TRIO, '2026-08-02'));
    const repriced = TRIO.map((m) => (m.id === 'gpt-5' ? { ...m, pricing: { input: 1.25, output: 5 } } : m));
    const after = lastmods(catalogOn(repriced, '2026-08-20'), ledger);

    expect(after['/models/gpt-5/']).toBe('2026-08-20');
    expect(after['/providers/openai/']).toBe('2026-08-20');
    expect(after['/models/']).toBe('2026-08-20');
    expect(after['/compare/claude-opus-5-vs-gpt-5/']).toBe('2026-08-20');
    expect(after['/models/claude-opus-5/']).toBe('2026-08-02');
    expect(after['/providers/anthropic/']).toBe('2026-08-02');
    expect(after['/compare/claude-opus-5-vs-gemini-3-pro/']).toBe('2026-08-02');
  });

  it('moves on the day a promotional rate lapses, because the price a reader sees changed', () => {
    const promo = [
      model('gpt-5', {
        pricing: { input: 1, output: 4, intro: { input: 0.5, output: 2, until: '2026-08-31' } },
      }),
    ];
    const ledger = record(catalogOn(promo, '2026-08-02'));
    expect(lastmods(catalogOn(promo, '2026-08-30'), ledger)['/models/gpt-5/']).toBe('2026-08-02');
    expect(lastmods(catalogOn(promo, '2026-09-01'), ledger)['/models/gpt-5/']).toBe('2026-09-01');
  });

  it('gives the same answer before and after the ledger records the change', () => {
    const ledger = record(catalogOn(TRIO, '2026-08-02'));
    const repriced = catalogOn(
      TRIO.map((m) => (m.id === 'gpt-5' ? { ...m, pricing: { input: 2, output: 8 } } : m)),
      '2026-08-20',
    );
    expect(lastmods(repriced, record(repriced, ledger))).toEqual(lastmods(repriced, ledger));
  });
});

describe('published comparisons', () => {
  /** gpt-5 and claude qualify as a pair until gpt-5's price moves more than
   *  3x away, at which point the curation alone would drop the page. */
  const before = [
    model('gpt-5', { providerId: 'openai' }),
    model('claude-opus-5', { providerId: 'anthropic' }),
  ];
  const after = [
    model('gpt-5', { providerId: 'openai', pricing: { input: 10, output: 40 } }),
    model('claude-opus-5', { providerId: 'anthropic' }),
  ];

  it('drops a pair the curation no longer picks when nothing remembers it', () => {
    expect(buildPages(catalogOn(after, '2026-09-01'), { asOf: ASOF }).comparisons).toEqual([]);
  });

  it('keeps building a pair once published, even when the curation would no longer pick it', () => {
    const ledger = record(catalogOn(before, '2026-08-02'));
    const set = buildPages(catalogOn(after, '2026-09-01'), { asOf: new Date('2026-09-01'), ledger });

    expect(set.comparisons.map((page) => page.slug)).toEqual(['claude-opus-5-vs-gpt-5']);
    expect(set.comparisons[0]!.kept).toBe(true);
    expect(set.retiredComparisons).toEqual([]);
    // Still linked from the model pages, so it is not an orphan.
    expect(set.models.find((page) => page.id === 'gpt-5')!.comparisons.map((link) => link.path)).toEqual([
      '/compare/claude-opus-5-vs-gpt-5/',
    ]);
  });

  it('applies the ceiling to new pairs only', () => {
    const ledger = record(catalogOn(TRIO, '2026-08-02'));
    const raw = catalogOn([...TRIO, model('grok-5', { providerId: 'xai' })], '2026-08-20');
    raw.providers = [...raw.providers, { id: 'xai', name: 'xAI', country: 'US' }];

    const set = buildPages(raw, { asOf: new Date('2026-08-20'), ledger, maxComparisons: 0 });
    expect(set.comparisons).toHaveLength(3);
    expect(set.comparisons.every((page) => !page.slug.includes('grok'))).toBe(true);
    expect(set.droppedComparisons).toBe(3);
  });

  it('retires a pair whose model has lost its page, pointing at the side that survives', () => {
    const ledger = record(catalogOn(before, '2026-08-02'));
    const gone = [
      model('gpt-5', { providerId: 'openai' }),
      model('claude-opus-5', {
        providerId: 'anthropic',
        displayName: 'Claude Opus 5',
        provenance: { source: 'vendor', lastVerified: '2026-08-01', stale: true },
      }),
    ];
    const set = buildPages(catalogOn(gone, '2026-09-01'), { asOf: new Date('2026-09-01'), ledger });

    expect(set.comparisons).toEqual([]);
    expect(set.retiredComparisons).toHaveLength(1);
    const retired = set.retiredComparisons[0]!;
    expect(retired.path).toBe('/compare/claude-opus-5-vs-gpt-5/');
    expect(retired.leftName).toBe('Claude Opus 5');
    expect(retired.survivors.map((link) => link.path)).toEqual(['/models/gpt-5/']);
    expect(retired.canonicalPath).toBe('/models/gpt-5/');
    // A signpost, not a page: not in the sitemap set and not counted.
    expect(set.all.some((page) => page.path === retired.path)).toBe(false);
  });

  it('follows a model that became an alias to the model it now routes to', () => {
    const ledger = record(catalogOn(before, '2026-08-02'));
    const renamed = [
      model('gpt-5', { providerId: 'openai' }),
      model('claude-opus-5', { providerId: 'anthropic', aliasOf: 'claude-opus-5-0' }),
      model('claude-opus-5-0', { providerId: 'anthropic', displayName: 'Claude Opus 5.0' }),
    ];
    const set = buildPages(catalogOn(renamed, '2026-09-01'), { asOf: new Date('2026-09-01'), ledger });
    const retired = set.retiredComparisons.find((page) => page.slug === 'claude-opus-5-vs-gpt-5')!;

    expect(retired.survivors.map((link) => link.path)).toEqual([
      '/models/claude-opus-5-0/',
      '/models/gpt-5/',
    ]);
  });

  it('falls back to the comparisons index when neither side survives', () => {
    const ledger = record(catalogOn(before, '2026-08-02'));
    const stale = { source: 'vendor' as const, lastVerified: '2026-08-01', stale: true };
    const set = buildPages(
      catalogOn(
        [
          model('gpt-5', { providerId: 'openai', provenance: stale }),
          model('claude-opus-5', { providerId: 'anthropic', provenance: stale }),
          model('o9', { providerId: 'openai' }),
        ],
        '2026-09-01',
      ),
      { asOf: new Date('2026-09-01'), ledger },
    );

    expect(set.retiredComparisons[0]!.survivors).toEqual([]);
    expect(set.retiredComparisons[0]!.canonicalPath).toBe('/compare/');
  });
});

describe('pairDifferences', () => {
  it('states each real difference once, naming the model it favours', () => {
    const left = model('a', {
      displayName: 'Alpha',
      contextWindow: 1_000_000,
      capabilities: { reasoning: true, vision: false },
      pricing: { input: 1, output: 4, cachedInput: 0.1, batchDiscount: 0.5 },
    });
    const right = model('b', {
      displayName: 'Beta',
      contextWindow: 200_000,
      capabilities: { reasoning: false, vision: true },
    });

    expect(pairDifferences(left, right, left.pricing, right.pricing)).toEqual([
      'Alpha reads up to 1M tokens of context in one request; Beta stops at 200K.',
      'Only Alpha is a reasoning model, so its output bill also pays for the thinking it does before it answers.',
      'Only Beta accepts images as input.',
      'Only Alpha publishes a cached-input rate, which cuts the cost of resending a long, unchanging prompt.',
      'Only Alpha offers a batch discount — 50% off both rates for work that can wait.',
    ]);
  });

  it('says nothing when the two match, and ignores gaps too small to print', () => {
    const left = model('a', { contextWindow: 128_000 });
    const right = model('b', { contextWindow: 128_100 });
    expect(pairDifferences(left, right, left.pricing, right.pricing)).toEqual([]);
  });

  it('compares cache discounts when both publish one', () => {
    const left = model('a', { displayName: 'Alpha', pricing: { input: 1, output: 4, cachedInput: 0.1 } });
    const right = model('b', { displayName: 'Beta', pricing: { input: 1, output: 4, cachedInput: 0.5 } });
    expect(pairDifferences(left, right, left.pricing, right.pricing)).toEqual([
      'Cached input costs 90% less than fresh input on Alpha and 50% less on Beta, which matters most for workloads that resend the same prompt.',
    ]);
  });
});
