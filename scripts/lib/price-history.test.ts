import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '../../src/lib/pricing/types';
import {
  buildHistory,
  COLUMNS,
  csvField,
  rowsForStep,
  toCsv,
  unitOf,
  type CatalogVersion,
} from './price-history';

function model(id: string, pricing: Model['pricing'], provenance: Partial<Model['provenance']> = {}): Model {
  return {
    id,
    providerId: 'acme',
    displayName: `Model ${id}`,
    status: 'current',
    contextWindow: 100_000,
    pricing,
    provenance: { source: 'litellm', lastVerified: '2026-08-01', ...provenance },
  } as Model;
}

function version(commit: string, committedAt: string, models: Model[]): CatalogVersion {
  const catalog = {
    schemaVersion: 2,
    generatedAt: committedAt,
    providers: [{ id: 'acme', name: 'Acme, Inc.', country: 'US', pricingUrl: 'https://acme.test/pricing' }],
    models,
  } as unknown as PricingCatalog;
  return { commit, committedAt, catalog };
}

describe('price history', () => {
  it('lists every rate a model arrives with, and nothing it lacks', () => {
    const rows = rowsForStep(
      undefined,
      version('c1', '2026-08-01T11:00:00Z', [model('a', { input: 1, output: 2 })]),
    );
    expect(rows.map((r) => [r.change, r.field, r.old_value, r.new_value])).toEqual([
      ['listed', 'input', '', '1'],
      ['listed', 'output', '', '2'],
    ]);
    expect(rows[0]).toMatchObject({
      date: '2026-08-01',
      commit: 'c1',
      provider_name: 'Acme, Inc.',
      unit: 'USD per 1M tokens',
      source: 'litellm',
      source_url: '',
      provider_pricing_url: 'https://acme.test/pricing',
    });
  });

  it('separates a price move, a correction, coverage and a delisting', () => {
    const rows = buildHistory([
      version('c1', '2026-08-01T11:00:00Z', [
        model('moves', { input: 1, output: 2 }),
        model('corrected', { input: 1, output: 2 }),
        model('gone', { input: 5, output: 6, cachedInput: 0.5 }),
      ]),
      version('c2', '2026-08-02T11:00:00Z', [
        model('moves', { input: 1.5, output: 2, batchDiscount: 0.5 }),
        model(
          'corrected',
          { input: 0.8, output: 2 },
          { source: 'vendor', verifiedUrl: 'https://acme.test/pricing/real' },
        ),
      ]),
    ]).filter((r) => r.commit === 'c2');

    expect(rows.map((r) => [r.model_id, r.change, r.field, r.old_value, r.new_value])).toEqual([
      ['moves', 'price', 'input', '1', '1.5'],
      ['moves', 'coverage', 'batchDiscount', '', '0.5'],
      ['corrected', 'correction', 'input', '1', '0.8'],
      ['gone', 'delisted', 'input', '5', ''],
      ['gone', 'delisted', 'output', '6', ''],
      ['gone', 'delisted', 'cachedInput', '0.5', ''],
    ]);
    expect(rows.find((r) => r.change === 'correction')?.source_url).toBe('https://acme.test/pricing/real');
  });

  it('dates a commit by its UTC day, not the committer’s local one', () => {
    const [row] = rowsForStep(
      undefined,
      version('c1', '2026-08-01T22:02:02-05:00', [model('a', { input: 1, output: 2 })]),
    );
    expect(row?.date).toBe('2026-08-02');
  });

  it('names a unit for every kind of field', () => {
    expect(unitOf('longContext.input')).toBe('USD per 1M tokens');
    expect(unitOf('batchDiscount')).toBe('multiplier');
    expect(unitOf('intro.until')).toBe('date');
    expect(unitOf('longContext.thresholdTokens')).toBe('tokens');
    expect(unitOf('cacheStoragePerMillionTokenHour')).toBe('USD per 1M tokens per hour');
  });

  it('writes RFC 4180 CSV, quoting only what needs it', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');

    const csv = toCsv(
      rowsForStep(undefined, version('c1', '2026-08-01T11:00:00Z', [model('a', { input: 1, output: 2 })])),
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(COLUMNS.join(','));
    expect(lines[1]).toContain(',"Acme, Inc.",');
    expect(lines).toHaveLength(4); // header, two rows, trailing empty after the final CRLF
  });
});
