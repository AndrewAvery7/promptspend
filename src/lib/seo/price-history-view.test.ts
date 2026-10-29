import { describe, expect, it } from 'vitest';
import type { HistoryRow, PriceHistory } from '../pricing/history';
import { priceChartSvg, niceStep } from './price-chart';
import { correctionCount, hasChartableMove, modelHistory, recentRepricings } from './price-history-view';

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    date: '2026-08-02',
    commit: 'abc',
    model_id: 'm1',
    model_name: 'Model One',
    provider_id: 'p',
    provider_name: 'P',
    change: 'listed',
    field: 'input',
    old_value: '',
    new_value: '2',
    unit: 'USD per 1M tokens',
    source: 'vendor',
    source_url: '',
    provider_pricing_url: '',
    ...overrides,
  };
}

function history(rows: HistoryRow[]): PriceHistory {
  return { schemaVersion: 1, firstDate: '2026-08-02', lastDate: '2026-10-01', rows };
}

const REPRICED = history([
  row({ field: 'input', new_value: '2' }),
  row({ field: 'output', new_value: '8' }),
  row({ date: '2026-09-01', change: 'price', field: 'input', old_value: '2', new_value: '1' }),
  row({ date: '2026-09-10', change: 'correction', field: 'output', old_value: '8', new_value: '6' }),
  row({ date: '2026-09-15', change: 'coverage', field: 'cachedInput', old_value: '', new_value: '0.1' }),
]);

describe('modelHistory', () => {
  it('builds a step series from the listing and each later move', () => {
    const view = modelHistory(REPRICED, 'm1');
    expect(view.listedOn).toBe('2026-08-02');
    expect(view.series.input).toEqual([
      { date: '2026-08-02', value: 2 },
      { date: '2026-09-01', value: 1 },
    ]);
    expect(view.series.output.map((p) => p.value)).toEqual([8, 6]);
  });

  it('keeps vendor repricing and correction apart, and drops coverage rows entirely', () => {
    const view = modelHistory(REPRICED, 'm1');
    expect(view.changes.map((c) => [c.field, c.kind])).toEqual([
      ['input', 'price'],
      ['output', 'correction'],
    ]);
  });

  it('knows nothing about a model that was never listed', () => {
    const view = modelHistory(REPRICED, 'other');
    expect(view.listedOn).toBeNull();
    expect(view.changes).toEqual([]);
    expect(view.series.input).toEqual([]);
  });

  it('records a delisting without treating it as a price', () => {
    const view = modelHistory(
      history([row({}), row({ date: '2026-09-20', change: 'delisted', new_value: '' })]),
      'm1',
    );
    expect(view.delistedOn).toBe('2026-09-20');
    expect(view.changes).toEqual([]);
  });
});

describe('hasChartableMove', () => {
  it('is true only when a headline rate took two different values', () => {
    expect(hasChartableMove(modelHistory(REPRICED, 'm1'))).toBe(true);
    expect(hasChartableMove(modelHistory(history([row({}), row({ field: 'output' })]), 'm1'))).toBe(false);
  });

  it('ignores a move in a rate that is not drawn', () => {
    const only = history([
      row({}),
      row({ date: '2026-09-01', change: 'price', field: 'cachedInput', old_value: '1', new_value: '2' }),
    ]);
    expect(hasChartableMove(modelHistory(only, 'm1'))).toBe(false);
    expect(modelHistory(only, 'm1').changes).toHaveLength(1);
  });
});

describe('recentRepricings', () => {
  const rows = history([
    row({ date: '2026-08-10', change: 'price', old_value: '4', new_value: '2' }),
    row({
      date: '2026-09-01',
      change: 'price',
      model_id: 'm2',
      model_name: 'Two',
      old_value: '1',
      new_value: '3',
    }),
    row({ date: '2026-09-02', change: 'correction', old_value: '5', new_value: '6' }),
    row({ date: '2026-09-03', change: 'price', old_value: '', new_value: '9' }),
  ]);

  it('lists vendor moves newest first and leaves corrections and unrecorded starts out', () => {
    const moves = recentRepricings(rows, 10);
    expect(moves.map((m) => [m.date, m.modelId, m.from, m.to])).toEqual([
      ['2026-09-01', 'm2', 1, 3],
      ['2026-08-10', 'm1', 4, 2],
    ]);
  });

  it('honors the limit and counts corrections separately', () => {
    expect(recentRepricings(rows, 1)).toHaveLength(1);
    expect(correctionCount(rows)).toBe(1);
  });
});

describe('priceChartSvg', () => {
  const svg = priceChartSvg({
    modelName: 'Model <One>',
    from: '2026-08-02',
    to: '2026-10-01',
    series: modelHistory(REPRICED, 'm1').series,
  });

  it('is a labeled image with a title and description, and escapes the model name', () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="chart-title">Model &#60;One&#62; price history</title>');
    expect(svg).not.toContain('Model <One>');
    expect(svg).toContain('input $2 then $1');
  });

  it('draws one staircase per rate, with a marker at each change and a direct label', () => {
    expect(svg.match(/<path class="chart-line/g)).toHaveLength(2);
    expect(svg.match(/<circle/g)).toHaveLength(2);
    expect(svg).toContain('>Input<');
    expect(svg).toContain('>Output<');
    // Steps are horizontal then vertical; no diagonal segment joins two prices.
    expect(svg).toMatch(/d="M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+ H[\d.]+"/);
  });

  it('starts the vertical axis at zero and shows both dates', () => {
    expect(svg).toContain('>$0<');
    expect(svg).toContain('>2026-08-02<');
    expect(svg).toContain('>2026-10-01<');
  });

  it('uses no inline style and no script, which the pages policy forbids', () => {
    expect(svg).not.toMatch(/style=|<script|onload=/i);
  });
});

describe('niceStep', () => {
  it('picks a round tick spacing', () => {
    expect(niceStep(8)).toBe(5);
    expect(niceStep(2)).toBe(1);
    expect(niceStep(30)).toBe(10);
    expect(niceStep(0.9)).toBeCloseTo(0.5, 10);
    expect(niceStep(15)).toBe(5);
  });
});
