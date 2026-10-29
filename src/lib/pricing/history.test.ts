import { describe, expect, it } from 'vitest';
import { isCalendarDate, isPriceHistory, priceOn, type HistoryRow, type PriceHistory } from './history';

function row(partial: Partial<HistoryRow>): HistoryRow {
  return {
    date: '2026-08-02',
    commit: 'c0ffee',
    model_id: 'claude-sonnet-5',
    model_name: 'Claude Sonnet 5',
    provider_id: 'anthropic',
    provider_name: 'Anthropic',
    change: 'listed',
    field: 'input',
    old_value: '',
    new_value: '',
    unit: 'USD per 1M tokens',
    source: 'vendor',
    source_url: '',
    provider_pricing_url: '',
    ...partial,
  };
}

const HISTORY: PriceHistory = {
  schemaVersion: 1,
  firstDate: '2026-08-02',
  lastDate: '2026-10-29',
  rows: [
    row({ field: 'input', new_value: '3' }),
    row({ field: 'output', new_value: '15' }),
    row({ field: 'intro.input', new_value: '2', unit: 'USD per 1M tokens' }),
    row({ field: 'intro.output', new_value: '10' }),
    row({ field: 'intro.until', new_value: '2026-08-31', unit: 'date' }),
    row({ date: '2026-08-05', change: 'coverage', field: 'cacheWrite', new_value: '3.75' }),
    row({
      date: '2026-09-10',
      change: 'correction',
      field: 'output',
      old_value: '15',
      new_value: '14',
      source_url: 'https://vendor.example/pricing',
    }),
    row({ date: '2026-10-01', change: 'price', field: 'input', old_value: '3', new_value: '2.5' }),
    row({ date: '2026-09-01', model_id: 'late-model', model_name: 'Late', field: 'input', new_value: '1' }),
    row({ date: '2026-09-01', model_id: 'late-model', model_name: 'Late', field: 'output', new_value: '2' }),
    row({ date: '2026-09-20', model_id: 'late-model', change: 'delisted', field: 'input', old_value: '1' }),
  ],
};

describe('price on a past date', () => {
  it('applies a promotion that was in force that day', () => {
    const r = priceOn(HISTORY, 'claude-sonnet-5', '2026-08-15');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.pricing.input).toBe(2);
    expect(r.pricing.output).toBe(10);
    expect(r.standard.input).toBe(3);
    expect(r.pricing.cacheWrite).toBe(3.75);
  });

  it('uses the standard rate once the promotion has ended, including the day after it', () => {
    const r = priceOn(HISTORY, 'claude-sonnet-5', '2026-09-01');
    expect(r.kind === 'ok' && r.pricing.input).toBe(3);
  });

  it('reports later corrections and price moves, so an old figure is never presented as settled', () => {
    const r = priceOn(HISTORY, 'claude-sonnet-5', '2026-09-05');
    expect(r.kind === 'ok' && r.later.map((c) => `${c.date} ${c.change} ${c.field}`)).toEqual([
      '2026-09-10 correction output',
      '2026-10-01 price input',
    ]);
  });

  it('counts a change published on the day itself', () => {
    const r = priceOn(HISTORY, 'claude-sonnet-5', '2026-10-01');
    expect(r.kind === 'ok' && r.pricing.input).toBe(2.5);
    expect(r.kind === 'ok' && r.later).toEqual([]);
  });

  it('never substitutes the first rate seen for a day before the model was tracked', () => {
    expect(priceOn(HISTORY, 'late-model', '2026-08-20')).toEqual({
      kind: 'not_tracked',
      listedOn: '2026-09-01',
    });
    expect(priceOn(HISTORY, 'nobody', '2026-08-20')).toEqual({ kind: 'not_tracked', listedOn: null });
  });

  it('says when a model had left the catalog', () => {
    expect(priceOn(HISTORY, 'late-model', '2026-09-25')).toEqual({
      kind: 'delisted',
      delistedOn: '2026-09-20',
    });
  });

  it('refuses dates outside the record rather than guessing', () => {
    expect(priceOn(HISTORY, 'claude-sonnet-5', '2026-07-31')).toEqual({
      kind: 'before_history',
      firstDate: '2026-08-02',
    });
    expect(priceOn(HISTORY, 'claude-sonnet-5', '2026-11-30')).toEqual({
      kind: 'after_history',
      lastDate: '2026-10-29',
    });
  });

  it('validates the published file and real calendar dates', () => {
    expect(isPriceHistory(HISTORY)).toBe(true);
    expect(isPriceHistory({ ...HISTORY, schemaVersion: 2 })).toBe(false);
    expect(isPriceHistory('<!doctype html>')).toBe(false);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-8-1')).toBe(false);
    expect(isCalendarDate('2026-08-01')).toBe(true);
  });
});
