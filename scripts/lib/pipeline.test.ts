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
import { diffCatalogs, renderChangelogEntry, summarizeDiff } from './diff';

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
    expect(summarizeDiff(diff)).toBe('no pricing changes');
    expect(renderChangelogEntry('2026-08-01', diff)).toMatch(/No changes/);
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
    expect(entry).toMatch(/output price up \$2 → \$3/);
  });
});
