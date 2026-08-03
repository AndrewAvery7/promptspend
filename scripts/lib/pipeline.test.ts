import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, validateCatalog, type PricingCatalog } from '../../src/lib/pricing/types';
import {
  comparisonKey,
  fromLiteLLM,
  fromOpenRouter,
  matchFamily,
  prettyName,
  slugify,
  type Allowlist,
} from './normalize';
import { CHANGE_REVIEW_THRESHOLD, DISAGREEMENT_THRESHOLD, mergeCatalog, relativeGap } from './merge';
import { catalogHash, diffCatalogs, diffToFeedItems, renderChangelogEntry, summarizeDiff } from './diff';

const ALLOWLIST: Allowlist = {
  providers: [
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
    { id: 'moonshot', name: 'Moonshot AI', country: 'CN' },
  ],
  globalExclude: ['\\d{8}$', '-latest$'],
  families: [
    {
      id: 'anthropic',
      providerId: 'anthropic',
      include: ['^claude-(opus|sonnet)-\\d+(-\\d+)?$'],
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
    },
    {
      id: 'moonshot',
      providerId: 'moonshot',
      include: ['^moonshot/kimi-k[\\d.]+$'],
      stripPrefix: 'moonshot/',
      tokenizer: { kind: 'approx', charsPerToken: 3.4, cjkCharsPerToken: 1.6 },
      capabilities: { reasoning: true, vision: false },
    },
  ],
};

const LITELLM = {
  'claude-sonnet-5': {
    mode: 'chat',
    input_cost_per_token: 3e-6,
    output_cost_per_token: 15e-6,
    max_input_tokens: 1_000_000,
  },
  'claude-sonnet-5-20260101': { mode: 'chat', input_cost_per_token: 3e-6, output_cost_per_token: 15e-6 },
  'claude-sonnet-latest': { mode: 'chat', input_cost_per_token: 3e-6, output_cost_per_token: 15e-6 },
  'moonshot/kimi-k2.6': {
    mode: 'chat',
    input_cost_per_token: 0.95e-6,
    output_cost_per_token: 4e-6,
    cache_read_input_token_cost: 0.16e-6,
  },
  'some-embedding-model': { mode: 'embedding', input_cost_per_token: 1e-8 },
  'unmatched-model': { mode: 'chat', input_cost_per_token: 1e-6, output_cost_per_token: 2e-6 },
};

describe('slugify and prettyName', () => {
  it('turns upstream keys into url-safe ids without losing version dots', () => {
    expect(slugify('moonshot/kimi-k2.6')).toBe('moonshot-kimi-k2.6');
    expect(slugify('amazon.nova-2-pro-v1:0')).toBe('amazon.nova-2-pro-v1-0');
    expect(slugify('gpt-5.4')).toBe('gpt-5.4');
  });

  it('derives a readable display name', () => {
    expect(prettyName('moonshot/kimi-k2.6', 'moonshot/')).toBe('Kimi K2.6');
    expect(prettyName('claude-sonnet-5')).toBe('Claude Sonnet 5');
  });
});

describe('matchFamily', () => {
  it('captures a family without naming individual versions', () => {
    expect(matchFamily('claude-sonnet-5', ALLOWLIST)?.providerId).toBe('anthropic');
    expect(matchFamily('claude-opus-4-8', ALLOWLIST)?.providerId).toBe('anthropic');
  });

  it('excludes dated snapshots and floating aliases', () => {
    expect(matchFamily('claude-sonnet-5-20260101', ALLOWLIST)).toBeNull();
    expect(matchFamily('claude-sonnet-latest', ALLOWLIST)).toBeNull();
  });

  it('ignores anything no family claims', () => {
    expect(matchFamily('some-other-model', ALLOWLIST)).toBeNull();
  });
});

describe('fromLiteLLM', () => {
  const rates = fromLiteLLM(LITELLM, ALLOWLIST);

  it('keeps only chat models the allowlist matched', () => {
    expect(rates.map((r) => r.id)).toEqual(['claude-sonnet-5', 'moonshot-kimi-k2.6']);
  });

  it('converts per-token costs into per-million rates', () => {
    const sonnet = rates.find((r) => r.id === 'claude-sonnet-5')!;
    expect(sonnet.inputPerMillion).toBe(3);
    expect(sonnet.outputPerMillion).toBe(15);
    expect(sonnet.contextWindow).toBe(1_000_000);
  });

  it('carries a published cached-input rate through', () => {
    expect(rates.find((r) => r.id === 'moonshot-kimi-k2.6')!.cachedInputPerMillion).toBeCloseTo(0.16, 6);
  });
});

describe('fromOpenRouter and comparisonKey', () => {
  it('matches the same model across differently-named catalogues', () => {
    expect(comparisonKey('moonshot/kimi-k2.6')).toBe(comparisonKey('moonshotai/kimi-k2.6'));
    expect(comparisonKey('anthropic/claude-sonnet-5')).toBe(comparisonKey('claude-sonnet-5'));
  });

  it('parses string prices into per-million numbers', () => {
    const parsed = fromOpenRouter({
      data: [{ id: 'anthropic/claude-sonnet-5', pricing: { prompt: '0.000003', completion: '0.000015' } }],
    });
    expect(parsed.get('claudesonnet5')?.inputPerMillion).toBe(3);
  });

  it('survives a malformed payload rather than crashing the run', () => {
    expect(fromOpenRouter(null).size).toBe(0);
    expect(fromOpenRouter({ data: 'nope' }).size).toBe(0);
    expect(fromOpenRouter({ data: [{ id: 'x' }] }).size).toBe(0);
  });
});

describe('mergeCatalog — the trust ladder', () => {
  const generatedAt = new Date('2026-08-01T06:00:00.000Z');
  const litellm = fromLiteLLM(LITELLM, ALLOWLIST);

  it('produces a catalog that passes its own validation', () => {
    const { catalog } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    expect(validateCatalog(catalog)).toEqual([]);
    expect(catalog.models).toHaveLength(2);
  });

  it('lets a hand-verified override beat the automated feed', () => {
    const { catalog } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [
        {
          id: 'claude-sonnet-5',
          displayName: 'Claude Sonnet 5',
          vendorVerified: true,
          pricing: { input: 3, output: 15, intro: { input: 2, output: 10, until: '2026-08-31' } },
        },
      ],
      generatedAt,
    });
    const sonnet = catalog.models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet.provenance.source).toBe('vendor');
    expect(sonnet.pricing.intro?.input).toBe(2);
  });

  it('flags a cross-source disagreement instead of publishing it quietly', () => {
    const openrouter = fromOpenRouter({
      data: [{ id: 'anthropic/claude-sonnet-5', pricing: { prompt: '0.000006', completion: '0.00003' } }],
    });
    const { catalog, review } = mergeCatalog({
      litellm,
      openrouter,
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    const sonnet = catalog.models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet.provenance.needsReview).toBe(true);
    expect(sonnet.pricing.input).toBe(3); // the feed's number is still what ships
    expect(review.some((item) => item.reason.includes('OpenRouter disagrees'))).toBe(true);
  });

  it('does not flag a disagreement inside the tolerance', () => {
    const openrouter = fromOpenRouter({
      data: [{ id: 'anthropic/claude-sonnet-5', pricing: { prompt: '0.0000031', completion: '0.0000152' } }],
    });
    const { review } = mergeCatalog({
      litellm,
      openrouter,
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    expect(review).toEqual([]);
  });

  it('holds back a price that moved more than half in a day', () => {
    const previous: PricingCatalog = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-07-31T06:00:00.000Z',
      providers: ALLOWLIST.providers,
      models: [
        {
          id: 'claude-sonnet-5',
          providerId: 'anthropic',
          displayName: 'Claude Sonnet 5',
          status: 'current',
          contextWindow: 1_000_000,
          pricing: { input: 12, output: 15 },
          tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
          capabilities: { reasoning: true, vision: true },
          provenance: { source: 'litellm', lastVerified: '2026-07-31' },
        },
      ],
    };
    const { review } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous,
      generatedAt,
    });
    expect(review.some((item) => item.reason.includes('moved'))).toBe(true);
  });

  it('flags a genuinely new model, but not every model on a cold start', () => {
    const cold = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    expect(cold.review).toEqual([]);

    const previous: PricingCatalog = { ...cold.catalog, models: [cold.catalog.models[0]!] };
    const warm = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous,
      generatedAt,
    });
    expect(warm.review.map((item) => item.id)).toEqual(['moonshot-kimi-k2.6']);
  });

  it('keeps a previously published model when the feed stops listing it', () => {
    // One truncated upstream response used to be enough to delete most of the
    // catalog — and because removals did not trip the review rule, the deletion
    // would have been committed straight to main and deployed.
    const cold = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    const empty = mergeCatalog({
      litellm: [],
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous: cold.catalog,
      generatedAt,
    });

    expect(empty.catalog.models).toHaveLength(cold.catalog.models.length);
    expect(empty.stale.sort()).toEqual(cold.catalog.models.map((m) => m.id).sort());
    for (const model of empty.catalog.models) {
      expect(model.provenance.stale).toBe(true);
      expect(model.provenance.needsReview).toBe(true);
    }
    expect(empty.review.every((item) => item.isNew)).toBe(true);
  });

  it('does not re-raise a flag it already recorded', () => {
    // A permanent disagreement must not open a fresh pull request every
    // morning; only a reason that was not there yesterday should.
    const openrouter = fromOpenRouter({
      data: [{ id: 'anthropic/claude-sonnet-5', pricing: { prompt: '0.000006', completion: '0.00003' } }],
    });
    const first = mergeCatalog({
      litellm,
      openrouter,
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    expect(first.review.some((item) => item.isNew)).toBe(true);

    const second = mergeCatalog({
      litellm,
      openrouter,
      allowlist: ALLOWLIST,
      overrides: [],
      previous: first.catalog,
      generatedAt,
    });
    expect(second.review.length).toBeGreaterThan(0);
    expect(second.review.every((item) => item.isNew)).toBe(false);
  });

  it('retires a model only when the allowlist says so', () => {
    const cold = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    const retired = mergeCatalog({
      litellm: [],
      openrouter: new Map(),
      allowlist: { ...ALLOWLIST, retired: ['claude-sonnet-5'] },
      overrides: [],
      previous: cold.catalog,
      generatedAt,
    });
    expect(retired.catalog.models.map((m) => m.id)).not.toContain('claude-sonnet-5');
  });

  it('records when a price last changed, separately from when it was checked', () => {
    const first = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt: new Date('2026-07-01T06:00:00.000Z'),
    });
    const laterSameNumbers = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous: first.catalog,
      generatedAt: new Date('2026-08-15T06:00:00.000Z'),
    });
    const sonnet = laterSameNumbers.catalog.models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet.provenance.lastVerified).toBe('2026-08-15');
    expect(sonnet.provenance.lastChanged).toBe('2026-07-01');
  });

  // The bug this guards: `lastChanged` was stamped with today for every model
  // on every run, so the published catalog claimed all 70 rows moved the same
  // morning. Provenance is the whole point of this project — a freshness date
  // that is true of everything is true of nothing.
  it('leaves every other model alone when a single price moves', () => {
    const cold = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt: new Date('2026-07-01T06:00:00.000Z'),
    });

    // Distinct, hand-written dates, so "untouched" has to mean these exact
    // values — not a date today's run happens to regenerate for everyone.
    const published: PricingCatalog = {
      ...cold.catalog,
      models: cold.catalog.models.map((m) => ({
        ...m,
        provenance: {
          ...m.provenance,
          lastVerified: '2026-07-31',
          lastChanged: m.id === 'claude-sonnet-5' ? '2026-03-04' : '2026-05-20',
        },
      })),
    };

    // Exactly one model's output rate moves. Nothing else about the run differs.
    const oneMoved = litellm.map((rate) =>
      rate.id === 'claude-sonnet-5' ? { ...rate, outputPerMillion: 18 } : rate,
    );
    const { catalog } = mergeCatalog({
      litellm: oneMoved,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous: published,
      generatedAt: new Date('2026-08-15T06:00:00.000Z'),
    });

    for (const model of catalog.models) {
      // Every model was re-checked today; only one of them moved.
      expect(model.provenance.lastVerified).toBe('2026-08-15');
      expect(model.provenance.lastChanged).toBe(model.id === 'claude-sonnet-5' ? '2026-08-15' : '2026-05-20');
    }
  });

  it('counts a cache rate moving as a change, exactly as the changelog does', () => {
    // `lastChanged` used to be decided by its own comparison of `input` and
    // `output` only. A cached-input move was reported as a **Price** change in
    // the changelog and simultaneously left `lastChanged` on the old date. Both
    // now read the same field list.
    const first = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt: new Date('2026-07-01T06:00:00.000Z'),
    });
    const cacheMoved = litellm.map((rate) =>
      rate.id === 'moonshot-kimi-k2.6' ? { ...rate, cachedInputPerMillion: 0.2 } : rate,
    );
    const second = mergeCatalog({
      litellm: cacheMoved,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous: first.catalog,
      generatedAt: new Date('2026-08-15T06:00:00.000Z'),
    });

    const kimi = second.catalog.models.find((m) => m.id === 'moonshot-kimi-k2.6')!;
    expect(diffCatalogs(first.catalog, second.catalog).changed.map((c) => c.field)).toEqual(['cachedInput']);
    expect(kimi.provenance.lastChanged).toBe('2026-08-15');
    expect(second.catalog.models.find((m) => m.id === 'claude-sonnet-5')!.provenance.lastChanged).toBe(
      '2026-07-01',
    );
  });

  it('does not invent a lastChanged for a row published without one', () => {
    // Rows written before the field existed carry no date. Filling one in with
    // today would assert a change that never happened — the exact way the
    // published catalog came to claim all 70 models moved on the same day.
    const previous: PricingCatalog = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-07-31T06:00:00.000Z',
      providers: ALLOWLIST.providers,
      models: [
        {
          id: 'claude-sonnet-5',
          providerId: 'anthropic',
          displayName: 'Claude Sonnet 5',
          status: 'current',
          contextWindow: 1_000_000,
          pricing: { input: 3, output: 15 },
          tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
          capabilities: { reasoning: true, vision: true },
          provenance: { source: 'litellm', lastVerified: '2026-07-31' },
        },
      ],
    };
    const { catalog } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      previous,
      generatedAt: new Date('2026-08-15T06:00:00.000Z'),
    });

    const sonnet = catalog.models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet.provenance.lastVerified).toBe('2026-08-15');
    expect(sonnet.provenance.lastChanged).toBeUndefined();
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it('carries cache writes, batch discounts and long-context tiers from an override', () => {
    const { catalog } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [
        {
          id: 'claude-sonnet-5',
          vendorVerified: true,
          verifiedUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
          pricing: {
            input: 3,
            output: 15,
            cachedInput: 0.3,
            cacheWrite: 3.75,
            batchDiscount: 0.5,
            longContext: { thresholdTokens: 272_000, input: 6, output: 22.5 },
          },
        },
      ],
      generatedAt,
    });
    const sonnet = catalog.models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet.pricing.cacheWrite).toBe(3.75);
    expect(sonnet.pricing.batchDiscount).toBe(0.5);
    expect(sonnet.pricing.longContext?.thresholdTokens).toBe(272_000);
    expect(sonnet.provenance.verifiedUrl).toMatch(/^https:/);
  });

  it('marks an alias so it is not counted as a separate model', () => {
    const { catalog } = mergeCatalog({
      litellm,
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [{ id: 'claude-sonnet-5', aliasOf: 'moonshot-kimi-k2.6' }],
      generatedAt,
    });
    expect(catalog.models.find((m) => m.id === 'claude-sonnet-5')!.aliasOf).toBe('moonshot-kimi-k2.6');
  });

  it('keeps a hand-curated model even if the feed drops it', () => {
    const { catalog } = mergeCatalog({
      litellm: [],
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [
        {
          id: 'claude-opus-5',
          providerId: 'anthropic',
          displayName: 'Claude Opus 5',
          vendorVerified: true,
          pricing: { input: 5, output: 25 },
        },
      ],
      generatedAt,
    });
    expect(catalog.models.map((m) => m.id)).toEqual(['claude-opus-5']);
  });

  it('lists only providers that actually have models', () => {
    const { catalog } = mergeCatalog({
      litellm: litellm.filter((r) => r.providerId === 'anthropic'),
      openrouter: new Map(),
      allowlist: ALLOWLIST,
      overrides: [],
      generatedAt,
    });
    expect(catalog.providers.map((p) => p.id)).toEqual(['anthropic']);
  });
});

describe('relativeGap', () => {
  it('is symmetric and scale-free', () => {
    expect(relativeGap(3, 6)).toBeCloseTo(0.5, 10);
    expect(relativeGap(6, 3)).toBeCloseTo(0.5, 10);
    expect(relativeGap(0, 0)).toBe(0);
  });

  it('sits either side of the documented thresholds as expected', () => {
    expect(relativeGap(3, 3.5)).toBeLessThan(DISAGREEMENT_THRESHOLD);
    expect(relativeGap(3, 6)).toBeGreaterThanOrEqual(CHANGE_REVIEW_THRESHOLD);
  });
});

describe('diffCatalogs', () => {
  const base: PricingCatalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-07-31T06:00:00.000Z',
    providers: ALLOWLIST.providers,
    models: [
      {
        id: 'a',
        providerId: 'anthropic',
        displayName: 'Model A',
        status: 'current',
        contextWindow: 1000,
        pricing: { input: 1, output: 2 },
        tokenizer: { kind: 'approx', charsPerToken: 3.8, cjkCharsPerToken: 1.5 },
        capabilities: { reasoning: false, vision: false },
        provenance: { source: 'litellm', lastVerified: '2026-07-31' },
      },
    ],
  };

  it('reports nothing when nothing moved', () => {
    const diff = diffCatalogs(base, base);
    expect(diff.isEmpty).toBe(true);
    expect(summarizeDiff(diff)).toBe('no catalog changes');
    expect(renderChangelogEntry('2026-08-01', diff)).toMatch(/No changes/);
  });

  // The diff compared `pricing.input` and `pricing.output` and nothing else, so
  // a run that changed a cache rate, a context window, a tokenizer or a review
  // flag reported "no changes" — and the workflow discarded the file it had
  // just produced. Each of these is that bug.
  it.each([
    ['a cached rate', { pricing: { input: 1, output: 2, cachedInput: 0.1 } }, 'changed'],
    ['a cache-write rate', { pricing: { input: 1, output: 2, cacheWrite: 1.25 } }, 'changed'],
    ['a batch discount', { pricing: { input: 1, output: 2, batchDiscount: 0.5 } }, 'changed'],
    [
      'promotional pricing',
      { pricing: { input: 1, output: 2, intro: { input: 0.5, output: 1, until: '2026-12-31' } } },
      'changed',
    ],
    [
      'a long-context tier',
      { pricing: { input: 1, output: 2, longContext: { thresholdTokens: 272_000, input: 2, output: 3 } } },
      'changed',
    ],
    ['a context window', { contextWindow: 2000 }, 'metadata'],
    ['a max output', { maxOutput: 500 }, 'metadata'],
    ['a status', { status: 'legacy' as const }, 'metadata'],
    ['a display name', { displayName: 'Model A (renamed)' }, 'metadata'],
    ['a capability index', { capabilityIndex: 80 }, 'metadata'],
    [
      'a tokenizer',
      { tokenizer: { kind: 'tiktoken' as const, encoding: 'o200k_base' as const } },
      'metadata',
    ],
    ['a capability flag', { capabilities: { reasoning: true, vision: false } }, 'metadata'],
  ])('notices %s changing', (_label, patch, bucket) => {
    const next: PricingCatalog = { ...base, models: [{ ...base.models[0]!, ...patch }] };
    const diff = diffCatalogs(base, next);
    expect(diff.isEmpty).toBe(false);
    expect(diff[bucket as 'changed' | 'metadata'].length).toBeGreaterThan(0);
  });

  it('notices a review flag being raised even when no price moved', () => {
    // The case that mattered most: a model gets flagged, prices are unchanged,
    // and the workflow used to see `changed=false` — so it neither committed
    // the flag nor opened a pull request about it.
    const next: PricingCatalog = {
      ...base,
      models: [
        {
          ...base.models[0]!,
          provenance: {
            source: 'litellm',
            lastVerified: '2026-08-01',
            needsReview: true,
            reviewNote: 'OpenRouter disagrees',
          },
        },
      ],
    };
    const diff = diffCatalogs(base, next);
    expect(diff.isEmpty).toBe(false);
    expect(diff.changed).toHaveLength(0);
    expect(diff.reviewState.map((c) => c.field)).toContain('provenance.needsReview');
    expect(diff.hasPriceChange).toBe(false);
  });

  it('ignores the two fields that move on every run', () => {
    // `generatedAt` and `lastVerified` change whether or not anything happened.
    // Counting them would make every diff non-empty and every day a commit.
    const next: PricingCatalog = {
      ...base,
      generatedAt: '2026-08-01T06:00:00.000Z',
      models: [
        {
          ...base.models[0]!,
          provenance: { ...base.models[0]!.provenance, lastVerified: '2026-08-01' },
        },
      ],
    };
    expect(diffCatalogs(base, next).isEmpty).toBe(true);
  });

  it('fingerprints the catalog so two runs can be compared at a glance', () => {
    const restamped: PricingCatalog = {
      ...base,
      generatedAt: '2026-08-01T06:00:00.000Z',
      models: [
        { ...base.models[0]!, provenance: { ...base.models[0]!.provenance, lastVerified: '2026-08-01' } },
      ],
    };
    const moved: PricingCatalog = {
      ...base,
      models: [{ ...base.models[0]!, pricing: { input: 1, output: 9 } }],
    };
    expect(catalogHash(restamped)).toBe(catalogHash(base));
    expect(catalogHash(moved)).not.toBe(catalogHash(base));
  });

  it('detects additions, removals and per-field price moves', () => {
    const next: PricingCatalog = {
      ...base,
      models: [
        { ...base.models[0]!, pricing: { input: 1, output: 3 } },
        { ...base.models[0]!, id: 'b', displayName: 'Model B' },
      ],
    };
    const diff = diffCatalogs(base, next);
    expect(diff.added.map((m) => m.id)).toEqual(['b']);
    expect(diff.changed).toEqual([{ id: 'a', displayName: 'Model A', field: 'output', from: 2, to: 3 }]);
    expect(diff.removed).toEqual([]);
    expect(summarizeDiff(diff)).toBe('1 added, 1 price change');
  });

  it('treats a first run as all-new', () => {
    expect(diffCatalogs(undefined, base).added).toHaveLength(1);
  });

  it('writes a changelog entry a human can read', () => {
    const next: PricingCatalog = {
      ...base,
      models: [{ ...base.models[0]!, pricing: { input: 1, output: 3 } }],
    };
    const entry = renderChangelogEntry('2026-08-01', diffCatalogs(base, next));
    expect(entry).toMatch(/## 2026-08-01/);
    expect(entry).toMatch(/\*\*Price\*\* `a` — output up 2 → 3/);
  });

  it('notices a provider being added, changed or dropped', () => {
    const added: PricingCatalog = {
      ...base,
      providers: [...base.providers, { id: 'openai', name: 'OpenAI', country: 'US' }],
    };
    expect(diffCatalogs(base, added).providers.map((c) => c.to)).toContain('added');

    const renamed: PricingCatalog = {
      ...base,
      providers: base.providers.map((p) => ({ ...p, name: `${p.name} Inc.` })),
    };
    expect(diffCatalogs(base, renamed).providers.map((c) => c.field)).toContain('name');

    const dropped: PricingCatalog = { ...base, providers: [base.providers[0]!] };
    expect(diffCatalogs(base, dropped).providers.map((c) => c.to)).toContain('removed');
  });

  it('turns a diff into feed items a subscriber can read', () => {
    const next: PricingCatalog = {
      ...base,
      models: [
        { ...base.models[0]!, pricing: { input: 1, output: 3 } },
        { ...base.models[0]!, id: 'b', displayName: 'Model B' },
      ],
    };
    const items = diffToFeedItems('2026-08-01', diffCatalogs(base, next));
    expect(items.map((i) => i.title)).toEqual(['New model: Model B', 'Model A: output increase']);
    expect(items[1]!.body).toMatch(/moved from 2 to 3/);

    const removedItems = diffToFeedItems('2026-08-01', diffCatalogs(base, { ...base, models: [] }));
    expect(removedItems[0]!.title).toBe('Removed: Model A');
  });

  it('describes a price cut as a cut and a rise as an increase', () => {
    const cheaper: PricingCatalog = {
      ...base,
      models: [{ ...base.models[0]!, pricing: { input: 1, output: 1 } }],
    };
    const entry = renderChangelogEntry('2026-08-01', diffCatalogs(base, cheaper));
    expect(entry).toMatch(/output down 2 → 1/);
    expect(diffToFeedItems('2026-08-01', diffCatalogs(base, cheaper))[0]!.title).toMatch(/cut/);
  });

  it('renders a value that appeared from nothing without printing "undefined"', () => {
    const withCache: PricingCatalog = {
      ...base,
      models: [{ ...base.models[0]!, pricing: { input: 1, output: 2, cachedInput: 0.1 } }],
    };
    const entry = renderChangelogEntry('2026-08-01', diffCatalogs(base, withCache));
    expect(entry).toMatch(/cachedInput to — → 0\.1/);
    expect(entry).not.toMatch(/undefined/);
  });

  it('lists a removal and a review change in the changelog', () => {
    const next: PricingCatalog = {
      ...base,
      models: [
        {
          ...base.models[0]!,
          id: 'c',
          provenance: {
            source: 'litellm',
            lastVerified: '2026-08-01',
            stale: true,
            needsReview: true,
            reviewNote: 'gone upstream',
          },
        },
      ],
    };
    const entry = renderChangelogEntry('2026-08-01', diffCatalogs(base, next));
    expect(entry).toMatch(/\*\*Removed\*\* `a`/);
    expect(summarizeDiff(diffCatalogs(base, next))).toMatch(/1 added, 1 removed/);
  });

  it('separates price changes from metadata in the changelog', () => {
    const next: PricingCatalog = {
      ...base,
      models: [{ ...base.models[0]!, contextWindow: 2000 }],
    };
    const diff = diffCatalogs(base, next);
    const entry = renderChangelogEntry('2026-08-01', diff);
    expect(entry).toMatch(/\*\*Metadata\*\* `a` — contextWindow: 1000 → 2000/);
    expect(diff.hasPriceChange).toBe(false);
  });
});
