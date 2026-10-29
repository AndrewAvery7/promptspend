import { describe, expect, it } from 'vitest';
import type { HistoryRow, PriceHistory } from '../pricing/history';
import { changesFaq } from './faq';
import { changesPageInput } from './changes-page';
import { renderChangesPage, CHANGES_PATH, type RenderContext } from './render';
import { renderFeed } from './feed';

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

const HISTORY: PriceHistory = {
  schemaVersion: 1,
  firstDate: '2026-08-02',
  lastDate: '2026-10-01',
  rows: [
    row({}),
    row({ field: 'output', new_value: '8' }),
    row({ date: '2026-08-10', change: 'price', old_value: '2', new_value: '1' }),
    row({ date: '2026-08-10', change: 'price', field: 'output', old_value: '8', new_value: '6' }),
    row({ date: '2026-08-12', change: 'correction', field: 'output', old_value: '6', new_value: '5' }),
    row({ date: '2026-08-15', change: 'coverage', field: 'cachedInput', old_value: '', new_value: '0.1' }),
    row({ date: '2026-09-01', model_id: 'm2', model_name: 'Model Two', change: 'listed', new_value: '3' }),
    row({
      date: '2026-09-01',
      model_id: 'm2',
      model_name: 'Model Two',
      change: 'listed',
      field: 'output',
      new_value: '9',
    }),
    row({ date: '2026-09-20', model_id: 'm2', model_name: 'Model Two', change: 'delisted', new_value: '' }),
  ],
};

const PATHS = { m1: '/models/model-one/' };
const input = changesPageInput(HISTORY, PATHS);

function ctx(): RenderContext & { hashed: string[] } {
  const hashed: string[] = [];
  return {
    siteUrl: 'https://promptspend.com',
    basePath: '/',
    cssPath: '/assets/pages.css',
    generatedAt: '2026-10-01T00:00:00.000Z',
    apiUrl: 'https://promptspend.dev',
    hashInline: (content: string) => {
      hashed.push(content);
      return `LEN${content.length}`;
    },
    hashed,
  };
}

describe('changesPageInput', () => {
  it('lists the days with news, newest first, and leaves coverage rows out', () => {
    expect(input.days.map((d) => d.date)).toEqual([
      '2026-09-20',
      '2026-09-01',
      '2026-08-12',
      '2026-08-10',
      '2026-08-02',
    ]);
    expect(input.lastChangeDate).toBe('2026-09-20');
    expect(JSON.stringify(input)).not.toContain('cachedInput');
  });

  it('keeps vendor repricing and corrections apart and works out each change', () => {
    const day = input.days.find((d) => d.date === '2026-08-10')!;
    expect(day.repriced.map((r) => [r.field, r.change])).toEqual([
      ['input', -0.5],
      ['output', -0.25],
    ]);
    expect(day.corrected).toEqual([]);
    expect(input.days.find((d) => d.date === '2026-08-12')!.corrected).toHaveLength(1);
  });

  it('counts what the intro sentence says', () => {
    expect(input.totals).toEqual({ repricingDays: 1, repriced: 2, corrected: 1, added: 1, removed: 1 });
  });

  it('treats the first day as the starting catalog, never as models added', () => {
    const first = input.days.find((d) => d.date === '2026-08-02')!;
    expect(first.startedWith).toBe(1);
    expect(first.added).toEqual([]);
    expect(renderChangesPage(input, ctx())).toContain(
      'PromptSpend began tracking on this day, with 1 model in the catalog',
    );
  });

  it('reports no change for a rate that was never recorded before', () => {
    const odd = changesPageInput(
      {
        ...HISTORY,
        rows: [row({}), row({ date: '2026-08-10', change: 'price', old_value: '', new_value: '4' })],
      },
      PATHS,
    );
    expect(odd.days[0]!.repriced[0]!.change).toBeNull();
  });
});

describe('renderChangesPage', () => {
  const html = renderChangesPage(input, ctx());

  it('has one anchored section per day and says what each kind of change is', () => {
    for (const day of input.days) expect(html).toContain(`<section id="${day.date}"`);
    expect(html).toContain('<h3>Price changes</h3>');
    expect(html).toContain('<h3>Corrections</h3>');
    expect(html).toContain('<h3>Models added</h3>');
    expect(html).toContain('<h3>Models removed</h3>');
    expect(html).toContain('PromptSpend had been reading the wrong page');
  });

  it('links models that have a page and prints the size of each change', () => {
    expect(html).toContain('<a href="/models/model-one/">Model One</a>');
    expect(html).toContain('Model Two');
    expect(html).not.toContain('href="/models/model-two/"');
    expect(html).toContain('−50%');
    expect(html).toContain('−25%');
  });

  it('points at the feed and the dataset, and has the intro counts', () => {
    expect(html).toContain('href="/feed.xml"');
    expect(html).toContain('price-history.csv');
    expect(html).toContain('2 times');
    expect(html).toContain('on 1 day,');
  });

  it('carries the Q&A with matching markup and no script or hidden text', () => {
    expect(html).toContain('id="faq"');
    for (const faq of changesFaq(input)) {
      expect(html).toContain(faq.question);
      expect(html).toContain('"acceptedAnswer"');
    }
    // Hidden text inside a scrolling table widens the page on a phone.
    expect(html.slice(html.indexOf('<main'), html.indexOf('</main>'))).not.toContain('visually-hidden');
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('is canonical at /changes/ and dated by its newest change', () => {
    expect(CHANGES_PATH).toBe('/changes/');
    expect(html).toContain('<link rel="canonical" href="https://promptspend.com/changes/" />');
    expect(html).toContain('"dateModified":"2026-09-20"');
  });
});

describe('the feed now points at the changes page', () => {
  it('links each entry to its own day on /changes/', () => {
    const xml = renderFeed(HISTORY, 'https://promptspend.com');
    expect(xml).toContain('href="https://promptspend.com/changes/#2026-08-10"');
    expect(xml).not.toContain('github.com/AndrewAvery7/promptspend/blob');
  });
});
