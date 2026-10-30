import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { formatMoney } from '../engine/format';
import { buildPages } from './pages';
import { comparisonShareCard, modelShareCard, providerShareCard } from './share-cards';

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

const set = buildPages(
  catalog([
    model('Cheap One', { pricing: { input: 2, output: 8 } }),
    model('Dear One', { pricing: { input: 3, output: 12 } }),
    model('Old One', { status: 'deprecated', pricing: { input: 30, output: 60 } }),
    // Comparisons pair models across providers.
    model('Rival One', { providerId: 'anthropic', pricing: { input: 2.5, output: 10 } }),
  ]),
  { asOf: ASOF },
);

describe('a model page’s share card', () => {
  const page = set.models.find((entry) => entry.model.id === 'Dear One')!;
  const card = modelShareCard(page);

  it('leads with the rates and the three monthly bills the page shows', () => {
    expect(card.headline).toBe('Dear One');
    expect(card.lines[0]).toBe('$3 input  ·  $12 output per 1M tokens');
    expect(card.chips.map((chip) => chip.value)).toEqual(
      page.examples.map((example) => `${formatMoney(example.perMonth)}/mo`),
    );
    expect(card.chips[0]!.label).toBe('SUPPORT CHATBOT');
  });

  it('is published beside the page, and its alt text repeats every figure', () => {
    expect(card.pagePath).toBe(page.path);
    expect(card.imagePath).toBe(`/og/models/${page.slug}.png`);
    for (const chip of card.chips) expect(card.alt).toContain(chip.value);
    expect(card.alt).toContain('$3 input and $12 output');
  });

  it('dates itself by the page’s content, never by the build', () => {
    expect(card.footer).toContain(`Updated ${page.lastmod}`);
  });
});

describe('a comparison page’s share card', () => {
  it('colors the cheaper side as a saving and the dearer as a cost', () => {
    const page = set.comparisons[0]!;
    const card = comparisonShareCard(page);
    const row = page.rows[0]!;
    expect(card.headline).toBe(`${page.left.displayName} vs ${page.right.displayName}`);
    expect(card.lines[0]).toBe(page.verdict);
    expect(card.chips[0]).toEqual({
      label: page.left.displayName.toUpperCase(),
      value: `${formatMoney(row.left)}/mo`,
      tone: row.cheaper === 'left' ? 'save' : 'cost',
    });
    expect(card.chips[1]!.tone).toBe(row.cheaper === 'right' ? 'save' : 'cost');
    expect(card.chips[2]!.label).toBe('DIFFERENCE');
    expect(card.imagePath).toBe(`/og/compare/${page.slug}.png`);
  });
});

describe('a provider page’s share card', () => {
  const page = set.providers.find((entry) => entry.id === 'openai')!;
  const card = providerShareCard(page);

  it('counts every model but sets the price range from the ones still sold', () => {
    expect(card.chips[0]!.value).toBe(String(page.models.length));
    // The retired model's $30 input is not something a reader can buy.
    expect(card.chips[1]!.value).toBe('$2–$3');
    expect(card.chips[2]!.value).toBe('$8–$12');
    expect(card.alt).toContain('Input $2–$3 and output $8–$12 per 1M tokens');
  });

  it('names the cheapest model', () => {
    expect(card.lines.some((line) => line.includes(page.cheapest!.displayName))).toBe(true);
  });
});
