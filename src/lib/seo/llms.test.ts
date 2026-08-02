import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { buildPages } from './pages';
import { renderLlmsTxt } from './llms';

const ASOF = new Date('2026-08-02T00:00:00Z');
const INPUT = {
  siteUrl: 'https://promptspend.com',
  apiUrl: 'https://promptspend.dev',
  generatedAt: '2026-08-02T02:00:00.000Z',
};

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId: 'openai',
    displayName: id,
    status: 'current',
    contextWindow: 400_000,
    capabilityIndex: 70,
    pricing: { input: 1, output: 4 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    ...overrides,
  };
}

function catalog(models: Model[]): PricingCatalog {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-08-02T02:00:00.000Z',
    providers: [
      { id: 'openai', name: 'OpenAI', country: 'US' },
      { id: 'anthropic', name: 'Anthropic', country: 'US' },
    ],
    models,
  };
}

const SET = buildPages(
  catalog([
    model('cheap', { pricing: { input: 0.1, output: 0.4 } }),
    model('mid', { pricing: { input: 1, output: 4 } }),
    model('dear', { providerId: 'anthropic', pricing: { input: 10, output: 40 } }),
  ]),
  { asOf: ASOF },
);

describe('renderLlmsTxt', () => {
  it('is an index, not a data dump', () => {
    const text = renderLlmsTxt(SET, INPUT);

    // Points at the pages and the API...
    expect(text).toContain('https://promptspend.com/models/');
    expect(text).toContain('https://promptspend.com/compare/');
    expect(text).toContain('https://promptspend.dev/v1/prices');
    expect(text).toContain('https://promptspend.com/data/pricing.json');
    // ...and stays small enough to be worth reading. Inlining 70 models'
    // rate cards would be stale by morning and enormous either way.
    expect(text.length).toBeLessThan(8_000);
  });

  it('uses absolute URLs throughout, since it is read away from the site', () => {
    const text = renderLlmsTxt(SET, INPUT);
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!);

    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(link).toMatch(/^https:\/\//);
  });

  it('names the cheapest models first, because that is what gets asked about', () => {
    const text = renderLlmsTxt(SET, INPUT);
    expect(text.indexOf('](https://promptspend.com/models/cheap/)')).toBeLessThan(
      text.indexOf('](https://promptspend.com/models/dear/)'),
    );
  });

  it('states the boundary of what a price here means', () => {
    // A confident wrong number repeated by an assistant is worse than none.
    const text = renderLlmsTxt(SET, INPUT);
    expect(text).toContain('USD per 1,000,000 tokens');
    expect(text).toContain('not** included');
    expect(text).toContain('list prices, not a quote');
  });

  it('warns off the fields that are most easily misread', () => {
    const text = renderLlmsTxt(SET, INPUT);
    // Every one of these has bitten somebody reading the raw catalog.
    expect(text).toContain('cacheWrite');
    expect(text).toContain('longContext');
    expect(text).toContain('capabilityIndex');
    expect(text).toContain('needsReview');
    expect(text).toMatch(/Do not present those as settled/);
  });

  it('carries the catalog timestamp, so staleness is visible', () => {
    expect(renderLlmsTxt(SET, INPUT)).toContain('2026-08-02T02:00:00.000Z');
  });
});
