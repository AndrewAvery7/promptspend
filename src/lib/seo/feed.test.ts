import { describe, expect, it } from 'vitest';
import type { HistoryRow, PriceHistory } from '../pricing/history';
import { newsworthyDays, renderFeed } from './feed';

function row(partial: Partial<HistoryRow>): HistoryRow {
  return {
    date: '2026-10-01',
    commit: 'c0ffee',
    model_id: 'gpt-5',
    model_name: 'GPT-5',
    provider_id: 'openai',
    provider_name: 'OpenAI',
    change: 'price',
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
  firstDate: '2026-10-01',
  lastDate: '2026-10-03',
  rows: [
    row({ change: 'listed', field: 'input', new_value: '1.25' }),
    row({ change: 'listed', field: 'output', new_value: '10' }),
    // Only a rate starting to be recorded: nobody's bill moved, so no entry.
    row({ date: '2026-10-02', change: 'coverage', field: 'cacheWrite', new_value: '1.5625' }),
    row({ date: '2026-10-03', change: 'price', field: 'input', old_value: '1.25', new_value: '1' }),
    row({ date: '2026-10-03', change: 'correction', field: 'output', old_value: '10', new_value: '8' }),
    row({
      date: '2026-10-03',
      model_id: 'gpt-6',
      model_name: 'GPT-6',
      change: 'listed',
      field: 'input',
      new_value: '2',
    }),
    row({
      date: '2026-10-03',
      model_id: 'gpt-6',
      model_name: 'GPT-6',
      change: 'listed',
      field: 'output',
      new_value: '8',
    }),
  ],
};

describe('the price-change feed', () => {
  it('leaves out coverage-only days and keeps repricing apart from corrections', () => {
    const days = newsworthyDays(HISTORY);
    expect(days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-03']);
    const last = days[1]!;
    expect(last.repriced.map((r) => r.field)).toEqual(['input']);
    expect(last.corrected.map((r) => r.field)).toEqual(['output']);
    expect(last.added).toEqual([{ id: 'gpt-6', name: 'GPT-6', input: '2', output: '8' }]);
  });

  it('counts corrections separately in the title and says what each kind means', () => {
    const xml = renderFeed(HISTORY, 'https://promptspend.com');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<id>tag:promptspend.com,2026-10-03:pricing-changes</id>');
    expect(xml).toContain('LLM pricing, 2026-10-03: 1 price change, 1 correction, 1 model added');
    expect(xml).toContain('the vendor’s rate did not move');
    expect(xml).not.toContain('2026-10-02');
    // Newest first, and the feed's own date is the newest entry's.
    expect(xml.indexOf('2026-10-03:pricing')).toBeLessThan(xml.indexOf('2026-10-01:pricing'));
    expect(xml).toContain('<updated>2026-10-03T12:00:00Z</updated>');
    // Entry HTML is escaped once inside <content type="html">, never raw.
    expect(xml).toContain('&lt;code&gt;gpt-6&lt;/code&gt;');
    expect(xml).not.toMatch(/<content type="html"><p>/);
  });

  it('is identical on a rebuild of the same history', () => {
    expect(renderFeed(HISTORY, 'https://promptspend.com')).toBe(
      renderFeed(HISTORY, 'https://promptspend.com'),
    );
  });
});
