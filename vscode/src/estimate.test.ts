import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { estimateSelection } from './estimate';

let catalog: Catalog;
const modelById = (id: string): Model => {
  const model = catalog.get(id);
  if (!model) throw new Error(`${id} is not in the catalog`);
  return model;
};

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
});

const PROMPT = 'Summarise the following support ticket in three bullet points, then suggest a next action.';

describe('estimateSelection', () => {
  it('counts exactly for an OpenAI-family model', async () => {
    // gpt-5 declares a tiktoken tokenizer, so this is a measured count and not a
    // ratio. If js-tiktoken ever stops resolving, the site's loader falls back
    // to a labelled estimate and this assertion is what notices.
    const [row] = await estimateSelection(PROMPT, [modelById('gpt-5')]);
    expect(row?.method).toBe('exact');
    expect(row?.tokens).toBeGreaterThan(0);
  });

  it('labels a calibrated ratio as an estimate', async () => {
    const gemini = catalog.models.find((m) => m.tokenizer.kind === 'approx');
    expect(gemini, 'catalog has no approx-tokenizer model').toBeDefined();
    const [row] = await estimateSelection(PROMPT, [gemini!]);
    expect(row?.method).toBe('estimate');
    expect(row?.note.length).toBeGreaterThan(0);
  });

  it('prices input only, at the input rate', async () => {
    const model = modelById('gpt-5');
    const [row] = await estimateSelection(PROMPT, [model]);
    // Recomputed from the row's own token count by an independent route.
    expect(row?.inputCostUsd).toBeCloseTo((row!.tokens / 1_000_000) * model.pricing.input, 12);
  });

  it('orders cheapest first', async () => {
    const models = ['gpt-5', 'claude-opus-4-5', 'gpt-5-nano'].map(modelById);
    const rows = await estimateSelection(PROMPT, models);
    const costs = rows.map((r) => r.inputCostUsd);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('returns nothing for no models rather than throwing', async () => {
    expect(await estimateSelection(PROMPT, [])).toEqual([]);
  });

  it('costs empty text at nothing', async () => {
    const [row] = await estimateSelection('', [modelById('gpt-5')]);
    expect(row?.tokens).toBe(0);
    expect(row?.inputCostUsd).toBe(0);
  });

  it('produces a finite cost for every model in the catalog', async () => {
    // The gutter-NaN guard, applied to the command as well as the annotation.
    const rows = await estimateSelection(PROMPT, catalog.models);
    for (const row of rows) {
      expect(Number.isFinite(row.inputCostUsd), row.model.id).toBe(true);
      expect(row.inputCostUsd, row.model.id).toBeGreaterThanOrEqual(0);
    }
  });
});
