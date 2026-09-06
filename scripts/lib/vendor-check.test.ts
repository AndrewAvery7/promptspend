import { describe, expect, it } from 'vitest';
import type { Model } from '../../src/lib/pricing/types';
import type { Override } from './normalize';
import {
  applyConfirmations,
  buildExtractionPrompt,
  buildReport,
  checkableRows,
  compareGroup,
  compareRate,
  groupByPage,
  htmlToText,
  isFreshReport,
  parsePageExtraction,
  unreadPage,
  VENDOR_CHECK_SCHEMA_VERSION,
  type Checkable,
  type PageRate,
} from './vendor-check';

const ASOF = new Date('2026-09-05T11:00:00.000Z');
const URL_A = 'https://platform.claude.com/docs/en/about-claude/pricing';
const URL_B = 'https://ai.google.dev/gemini-api/docs/pricing';

const full: Override = {
  id: 'claude-opus-5',
  displayName: 'Claude Opus 5',
  vendorVerified: true,
  lastVerified: '2026-08-03',
  verifiedUrl: URL_A,
  pricing: { input: 5, output: 25, cachedInput: 0.5 },
};
const provenanceOnly: Override = {
  id: 'claude-opus-4-7',
  vendorVerified: true,
  lastVerified: '2026-08-03',
  verifiedUrl: URL_A,
};
const promo: Override = {
  id: 'gemini-gemini-3.6-flash',
  displayName: 'Gemini 3.6 Flash',
  vendorVerified: true,
  lastVerified: '2026-08-16',
  verifiedUrl: URL_B,
  pricing: {
    input: 1.5,
    output: 7.5,
    cachedInput: 0.15,
    intro: { input: 0.75, output: 3.75, until: '2026-12-31' },
  },
};
const nameOnly: Override = { id: 'gpt-5', displayName: 'GPT-5' };
const unverified: Override = { id: 'o3', verifiedUrl: URL_A, pricing: { input: 2, output: 8 } };

const published = new Map<string, Model['pricing']>([
  ['claude-opus-4-7', { input: 5, output: 25, cachedInput: 0.5 }],
  ['gpt-5', { input: 1.25, output: 10 }],
]);

function row(override: Override, pricing?: Model['pricing']): Checkable {
  return { override, url: override.verifiedUrl!, pricing: pricing ?? (override.pricing as Model['pricing']) };
}

describe('checkableRows and groupByPage', () => {
  it('keeps hand-verified rows and takes a provenance-only row’s figure from the catalog', () => {
    const rows = checkableRows([full, provenanceOnly, promo, nameOnly, unverified], published);
    expect(rows.map((r) => r.override.id)).toEqual([
      'claude-opus-5',
      'claude-opus-4-7',
      'gemini-gemini-3.6-flash',
    ]);
    expect(rows[1]!.pricing).toEqual({ input: 5, output: 25, cachedInput: 0.5 });
  });

  it('skips a provenance-only row the catalog has not published yet', () => {
    expect(checkableRows([provenanceOnly], new Map())).toEqual([]);
  });

  it('reads each page once, however many rows cite it', () => {
    const pages = groupByPage(checkableRows([full, provenanceOnly, promo], published));
    expect([...pages.keys()]).toEqual([URL_A, URL_B]);
    expect(pages.get(URL_A)!.map((r) => r.override.id)).toEqual(['claude-opus-5', 'claude-opus-4-7']);
  });
});

describe('buildExtractionPrompt', () => {
  it('names the rows to find and never the figures on record', () => {
    const prompt = buildExtractionPrompt(
      URL_A,
      [row(full), row(provenanceOnly, published.get('claude-opus-4-7'))],
      'BODY',
    );
    expect(prompt).toContain('- claude-opus-5 — Claude Opus 5');
    expect(prompt).toContain('- claude-opus-4-7\n');
    expect(prompt).toContain('<<<PAGE\nBODY\nPAGE>>>');
    expect(prompt).not.toMatch(/\$?\b25\b/);
  });
});

describe('parsePageExtraction', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const parsed = parsePageExtraction({
      models: [
        {
          id: 'a',
          found: true,
          input: 1,
          output: 2,
          cachedInput: 0.1,
          note: 'ok',
          promo: { input: 0.5, output: 1, until: '2026-12-31' },
        },
        { id: 'b', found: false, note: '' },
        { id: 'c', found: true, input: '1', promo: { input: 1 } },
        { found: true },
        null,
        'junk',
      ],
    });
    expect(parsed.models).toEqual([
      {
        id: 'a',
        found: true,
        input: 1,
        output: 2,
        cachedInput: 0.1,
        note: 'ok',
        promo: { input: 0.5, output: 1, until: '2026-12-31' },
      },
      { id: 'b', found: false },
      { id: 'c', found: true },
    ]);
  });

  it('refuses a payload with no models array', () => {
    expect(() => parsePageExtraction({})).toThrow(/models array/);
    expect(() => parsePageExtraction(null)).toThrow(/models array/);
  });
});

describe('compareRate', () => {
  const opus = row(full);
  const flash = row(promo);

  it('confirms when the page agrees, within rounding', () => {
    const item = compareRate(
      opus,
      { id: 'claude-opus-5', found: true, input: 5.0, output: 25.1, cachedInput: 0.5 },
      ASOF,
    );
    expect(item.status).toBe('confirmed');
    expect(item.detail).toContain('$5/$25.1');
    expect(item.detail).toContain('cached $0.5');
  });

  it('flags a standard rate that moved', () => {
    const item = compareRate(opus, { id: 'claude-opus-5', found: true, input: 6, output: 25 }, ASOF);
    expect(item.status).toBe('mismatch');
    expect(item.detail).toBe('page lists $6/$25 vs recorded $5/$25');
  });

  it('flags a cached rate that moved even when the base rate agrees', () => {
    const item = compareRate(
      opus,
      { id: 'claude-opus-5', found: true, input: 5, output: 25, cachedInput: 1 },
      ASOF,
    );
    expect(item.status).toBe('mismatch');
    expect(item.detail).toBe('cached input $1 vs recorded $0.5');
  });

  it('flags a promotion the record does not carry', () => {
    const item = compareRate(
      opus,
      {
        id: 'claude-opus-5',
        found: true,
        input: 5,
        output: 25,
        promo: { input: 4, output: 20, until: '2026-10-01' },
      },
      ASOF,
    );
    expect(item.status).toBe('mismatch');
    expect(item.detail).toBe('page lists a promotional rate $4/$20 until 2026-10-01 that is not recorded');
  });

  it('leaves the date alone when the model is not on the page', () => {
    expect(
      compareRate(opus, { id: 'claude-opus-5', found: false, note: 'only Opus 5.1 listed' }, ASOF),
    ).toMatchObject({
      status: 'unconfirmed',
      detail: 'not priced on the page (only Opus 5.1 listed)',
    });
    expect(compareRate(opus, undefined, ASOF).status).toBe('unconfirmed');
    expect(compareRate(opus, { id: 'claude-opus-5', found: true }, ASOF)).toMatchObject({
      status: 'unconfirmed',
      detail: 'listed, but no price could be read',
    });
  });

  describe('while an intro rate is in force', () => {
    it('confirms when the page shows both the promotion and the standard rate', () => {
      const item = compareRate(
        flash,
        {
          id: promo.id,
          found: true,
          input: 1.5,
          output: 7.5,
          cachedInput: 0.15,
          promo: { input: 0.75, output: 3.75 },
        },
        ASOF,
      );
      expect(item.status).toBe('confirmed');
    });

    it('cannot confirm the standard rate from a page that shows only the promotion', () => {
      const viaPromo = compareRate(
        flash,
        { id: promo.id, found: true, promo: { input: 0.75, output: 3.75 } },
        ASOF,
      );
      expect(viaPromo.status).toBe('unconfirmed');
      expect(viaPromo.detail).toContain('standard rate $1.5/$7.5 is not shown');

      const viaStandard = compareRate(flash, { id: promo.id, found: true, input: 0.75, output: 3.75 }, ASOF);
      expect(viaStandard.status).toBe('unconfirmed');
      expect(viaStandard.detail).toContain('only the promotional figure');
    });

    it('flags a promotion the page has withdrawn early', () => {
      const item = compareRate(flash, { id: promo.id, found: true, input: 1.5, output: 7.5 }, ASOF);
      expect(item.status).toBe('mismatch');
      expect(item.detail).toBe(
        'page no longer shows the promotional rate $0.75/$3.75 recorded until 2026-12-31',
      );
    });

    it('flags a promotion whose figures moved, and a standard rate that moved beside it', () => {
      const moved = compareRate(
        flash,
        { id: promo.id, found: true, input: 2, output: 7.5, promo: { input: 0.5, output: 3.75 } },
        ASOF,
      );
      expect(moved.status).toBe('mismatch');
      expect(moved.detail).toContain(
        'promotional rate $0.5/$3.75 vs recorded intro $0.75/$3.75 until 2026-12-31',
      );
      expect(moved.detail).toContain('standard rate $2/$7.5 vs recorded $1.5/$7.5');

      const neither = compareRate(flash, { id: promo.id, found: true, input: 2, output: 9 }, ASOF);
      expect(neither.status).toBe('mismatch');
      expect(neither.detail).toBe(
        'page lists $2/$9 vs recorded $1.5/$7.5 (intro $0.75/$3.75 until 2026-12-31)',
      );
    });

    it('compares a promotional cached rate when both sides publish one', () => {
      const withCache = row({
        ...promo,
        pricing: {
          ...promo.pricing!,
          intro: { input: 0.75, output: 3.75, cachedInput: 0.075, until: '2026-12-31' },
        },
      });
      const item = compareRate(
        withCache,
        {
          id: promo.id,
          found: true,
          input: 1.5,
          output: 7.5,
          promo: { input: 0.75, output: 3.75, cachedInput: 0.1 },
        },
        ASOF,
      );
      expect(item.status).toBe('mismatch');
      expect(item.detail).toBe('promotional cached input $0.1 vs recorded $0.075');
    });
  });

  it('treats an expired intro as if it were not there', () => {
    const after = new Date('2027-01-15T00:00:00.000Z');
    expect(compareRate(flash, { id: promo.id, found: true, input: 1.5, output: 7.5 }, after).status).toBe(
      'confirmed',
    );
    expect(compareRate(flash, { id: promo.id, found: true, input: 0.75, output: 3.75 }, after).status).toBe(
      'mismatch',
    );
  });
});

describe('compareGroup and unreadPage', () => {
  const rows = [row(full), row(provenanceOnly, published.get('claude-opus-4-7'))];

  it('matches page entries to rows by id and reports the ones the page omitted', () => {
    const rates: PageRate[] = [{ id: 'claude-opus-5', found: true, input: 5, output: 25 }];
    const items = compareGroup(rows, { models: rates }, ASOF);
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ['claude-opus-5', 'confirmed'],
      ['claude-opus-4-7', 'unconfirmed'],
    ]);
  });

  it('names every row on a page that could not be read', () => {
    const items = unreadPage(rows, 'HTTP 503');
    expect(items).toHaveLength(2);
    expect(
      items.every((i) => i.status === 'unconfirmed' && i.detail === 'page could not be read: HTTP 503'),
    ).toBe(true);
  });
});

describe('applyConfirmations', () => {
  it('moves the date on confirmed rows only, and says which', () => {
    const items = [
      { id: 'claude-opus-5', url: URL_A, status: 'confirmed' as const, detail: '' },
      { id: 'claude-opus-4-7', url: URL_A, status: 'mismatch' as const, detail: '' },
    ];
    const { overrides, bumped } = applyConfirmations([full, provenanceOnly, nameOnly], items, '2026-09-05');
    expect(bumped).toEqual(['claude-opus-5']);
    expect(overrides[0]).toEqual({ ...full, lastVerified: '2026-09-05' });
    expect(overrides[1]).toBe(provenanceOnly);
    expect(overrides[2]).toBe(nameOnly);
  });

  it('keeps the key order of the row it rewrites, so the file diff is one line', () => {
    const { overrides } = applyConfirmations(
      [full],
      [{ id: 'claude-opus-5', url: URL_A, status: 'confirmed', detail: '' }],
      '2026-09-05',
    );
    expect(Object.keys(overrides[0]!)).toEqual(Object.keys(full));
  });

  it('does not count a row already dated today', () => {
    const today = { ...full, lastVerified: '2026-09-05' };
    const { bumped } = applyConfirmations(
      [today],
      [{ id: full.id, url: URL_A, status: 'confirmed', detail: '' }],
      '2026-09-05',
    );
    expect(bumped).toEqual([]);
  });
});

describe('buildReport and isFreshReport', () => {
  const items = [
    { id: 'a', url: URL_A, status: 'confirmed' as const, detail: '' },
    { id: 'b', url: URL_A, status: 'mismatch' as const, detail: '' },
    { id: 'c', url: URL_B, status: 'unconfirmed' as const, detail: '' },
  ];
  const report = buildReport(ASOF, 'claude-opus-5', [{ url: URL_A, ok: true, modelIds: ['a', 'b'] }], items);

  it('totals the outcomes', () => {
    expect(report).toMatchObject({
      schemaVersion: VENDOR_CHECK_SCHEMA_VERSION,
      checkedAt: ASOF.toISOString(),
      extractionModel: 'claude-opus-5',
      confirmed: 1,
      mismatched: 1,
      unconfirmed: 1,
    });
  });

  it('is fresh for the morning it describes and stale after that', () => {
    expect(isFreshReport(report, new Date('2026-09-06T10:00:00.000Z'))).toBe(true);
    expect(isFreshReport(report, new Date('2026-09-07T11:00:00.000Z'))).toBe(false);
    expect(isFreshReport(undefined, ASOF)).toBe(false);
    expect(isFreshReport({ ...report, schemaVersion: 99 }, ASOF)).toBe(false);
    expect(isFreshReport({ ...report, checkedAt: 'never' }, ASOF)).toBe(false);
  });
});

describe('htmlToText', () => {
  it('keeps the table cells and drops everything that is not content', () => {
    const html = `<html><head><style>p{}</style><script>var x = "<td>";</script></head>
      <body><!-- nav --><nav><a href="/">Home</a></nav>
      <h1>Pricing</h1><table><tr><th>Model</th><th>Input</th></tr>
      <tr><td>Opus&nbsp;5</td><td>$5 &amp; up</td></tr></table>
      <p>Line one<br/>line two &#36;3 &#x24;4</p></body></html>`;
    const text = htmlToText(html);
    expect(text).not.toContain('var x');
    expect(text).not.toContain('p{}');
    expect(text).toContain('Model | Input |');
    expect(text).toContain('Opus 5 | $5 & up |');
    expect(text).toContain('Line one\nline two $3 $4');
    expect(text).not.toMatch(/\n{3}/);
  });

  it('leaves an unknown entity alone rather than guessing', () => {
    expect(htmlToText('a &zzz; b')).toBe('a &zzz; b');
  });
});
