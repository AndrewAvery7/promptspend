import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatQuarterTally,
  formatReportDraft,
  logDates,
  median,
  parseNotes,
  parseQuarter,
  percent,
  previousQuarter,
  reportSlug,
  tallyQuarter,
  vendorResolver,
  type CatalogSnapshot,
} from './quarterly-tally';
import { parseFrontmatter, renderMarkdown } from '../../src/lib/seo/prose';

const LOG = `# Pricing changelog

## 2026-09-30

- **Price** \`a-one\` — input down 4 → 2
- **Coverage** \`b-two\` — intro.until now tracked: — → 2026-10-15

## 2026-10-01

- **Price** \`a-one\` — input up 2 → 3
- **Price** \`a-one\` — output down 20 → 10
- **Review** \`b-two\` — provenance.needsReview: — → true

## 2026-10-02

> **Not a vendor price rise.** The catalog caught up
> with a page that changed in September.

- **Price** \`b-two\` — input up 1 → 1.5
- **Price** \`b-two\` — output up 2 → 4
- **Added** \`c-three\` — C Three ($1 in / $2 out per 1M)
- **Added** \`zz-unknown\` — Mystery ($1 in / $2 out per 1M)

## 2026-11-20

- **Metadata** \`a-one\` — status: current → legacy
- **Metadata** \`b-two\` — status: current → deprecated
- **Metadata** \`c-three\` — status: legacy → current
- **Metadata** \`c-three\` — contextWindow: 1000 → 2000
- **Review** \`b-two\` — provenance.needsReview: true → —
- **Coverage** \`b-two\` — intro.until no longer published: 2026-10-15 → —

## 2026-12-30

`;

const CATALOG: CatalogSnapshot = {
  generatedAt: '2026-12-30T11:00:00.000Z',
  providers: [
    { id: 'acme', name: 'Acme' },
    { id: 'bolt', name: 'Bolt' },
  ],
  models: [
    { id: 'a-one', providerId: 'acme', pricing: {} },
    { id: 'b-two', providerId: 'bolt', pricing: {} },
    {
      id: 'c-three',
      providerId: 'acme',
      pricing: { intro: { until: '2026-12-31' } },
      provenance: { needsReview: true },
    },
    { id: 'd-four', providerId: 'acme', pricing: { intro: { until: '2027-02-01' } } },
  ],
};

describe('quarters', () => {
  it('knows the months, the days and the next quarter', () => {
    expect(parseQuarter('2026-q4')).toEqual({
      id: '2026-Q4',
      name: 'Q4 2026',
      months: ['2026-10', '2026-11', '2026-12'],
      start: '2026-10-01',
      end: '2026-12-31',
      next: '2027-01-01',
    });
    expect(parseQuarter('2027-Q1')).toMatchObject({ end: '2027-03-31', next: '2027-04-01' });
    expect(parseQuarter('2028-Q1').end).toBe('2028-03-31');
    expect(parseQuarter('2026-Q3')).toMatchObject({
      start: '2026-07-01',
      end: '2026-09-30',
      next: '2026-10-01',
    });
    expect(previousQuarter('2027-Q1')).toBe('2026-Q4');
    expect(previousQuarter('2026-Q4')).toBe('2026-Q3');
    expect(() => parseQuarter('2026-Q5')).toThrow(/not a quarter/);
    expect(reportSlug(parseQuarter('2026-Q4'))).toBe('2026-q4-state-of-llm-pricing');
  });

  it('reads every dated heading and the notes above a day’s rows', () => {
    expect(logDates(LOG)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-11-20', '2026-12-30']);
    expect(parseNotes(LOG)).toEqual([
      {
        date: '2026-10-02',
        note: '**Not a vendor price rise.** The catalog caught up with a page that changed in September.',
      },
    ]);
  });

  it('takes a median of odd and even lists, and none of an empty one', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect([percent(0.5), percent(-0.25), percent(0), percent(null)]).toEqual(['+50%', '−25%', '0%', 'n/a']);
  });

  it('names a vendor from the catalog, falling back to the id’s first word', () => {
    const vendorOf = vendorResolver(CATALOG);
    expect(vendorOf('b-two')).toBe('Bolt');
    expect(vendorOf('zz-unknown')).toBe('zz');
    expect(vendorOf('acme')).toBe('Acme');
  });
});

describe('the quarterly tally', () => {
  const tally = tallyQuarter(LOG, CATALOG, '2026-Q4');

  it('counts only the quarter, by kind and by month', () => {
    expect(tally.entries).toBe(13);
    expect(tally.byKind).toMatchObject({ Price: 4, Added: 2, Metadata: 4, Review: 2, Coverage: 1 });
    expect(tally.months.map((month) => month.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(tally.months[1]!.byKind.Metadata).toBe(4);
  });

  it('splits increases from cuts and takes the median size of a change', () => {
    expect(tally.increases).toBe(3);
    expect(tally.cuts).toBe(1);
    expect(tally.pricedModels).toEqual(['a-one', 'b-two']);
    expect([tally.modelsUp, tally.modelsDown, tally.modelsMixed]).toEqual([1, 0, 1]);
    // Changes: +50%, −50%, +50%, +100%.
    expect(tally.medianChange).toBe(0.5);
    expect(tally.medianIncrease).toBe(0.5);
    expect(tally.medianCut).toBe(-0.5);
  });

  it('tallies each vendor', () => {
    expect(tally.vendors).toEqual([
      { vendor: 'Acme', priceRows: 2, models: 1, increases: 1, cuts: 1, added: 1, retired: 1 },
      { vendor: 'Bolt', priceRows: 2, models: 1, increases: 2, cuts: 0, added: 0, retired: 1 },
      { vendor: 'zz', priceRows: 0, models: 0, increases: 0, cuts: 0, added: 1, retired: 0 },
    ]);
  });

  it('separates retirements from restorations', () => {
    expect(tally.retirements.map((r) => `${r.id} ${r.to}`)).toEqual(['a-one legacy', 'b-two deprecated']);
    expect(tally.restored.map((r) => r.id)).toEqual(['c-three']);
    expect(tally.added.map((a) => a.id)).toEqual(['c-three', 'zz-unknown']);
  });

  it('finds introductory prices ending in the quarter from the log and the catalog', () => {
    expect(tally.introExpiries).toEqual([
      { id: 'b-two', vendor: 'Bolt', until: '2026-10-15', state: 'expired', source: 'log' },
      { id: 'c-three', vendor: 'Acme', until: '2026-12-31', state: 'scheduled', source: 'catalog' },
    ]);
  });

  it('counts disputed-price flags raised and cleared, and the ones still open', () => {
    expect(tally.disputes).toEqual({
      raised: 1,
      cleared: 1,
      modelsRaised: ['b-two'],
      openNow: 1,
      openModels: ['c-three'],
      snapshotAt: '2026-12-30T11:00:00.000Z',
    });
  });

  it('points at annotated days and knows the quarter is not over until the log reaches the next one', () => {
    expect(tally.annotatedDays.map((day) => day.date)).toEqual(['2026-10-02']);
    expect(tally.logThrough).toBe('2026-12-30');
    expect(tally.quarterIsComplete).toBe(false);
    expect(tallyQuarter(LOG, CATALOG, '2026-Q3').quarterIsComplete).toBe(true);
  });

  it('formats the tally with the previous quarter beside it', () => {
    const text = formatQuarterTally(tally, tallyQuarter(LOG, CATALOG, '2026-Q3'));
    expect(text).toContain('Q4 2026 is not complete and every figure below is partial');
    expect(text).toContain('- Price: 4 (1)');
    expect(text).toContain('- Increases: 3 (0); cuts: 1 (1)');
    expect(text).toContain('- Median size of a change: +50% (+50%)');
    expect(text).toContain('- 2026-10-02 `b-two` output: 2 → 4 (+100%)');
    expect(text).toContain('- Bolt: 2 price rows on 1 model (2 up, 0 down); 0 added; 1 retired');
    expect(text).toContain('- Restored 2026-11-20: `c-three` legacy → current');
    expect(text).toContain('- 2026-12-31 `c-three` (Acme): scheduled, from the catalog');
    expect(text).toContain('Open in the catalog snapshot of 2026-12-30T11:00:00.000Z: 1 (`c-three`)');
    expect(text).toContain('## Days the log annotated');
  });

  it('formats an empty quarter without inventing anything', () => {
    const empty = tallyQuarter(LOG, { ...CATALOG, models: [] }, '2026-Q2');
    const text = formatQuarterTally(empty, empty);
    for (const line of ['- No rate moved.', '- No vendor activity.', '- None.']) expect(text).toContain(line);
    expect(empty.medianChange).toBeNull();
    const draft = formatReportDraft(empty, empty, '2026-07-02');
    expect(draft).toContain('- No vendor changed a price.');
    expect(draft).toContain('Median size of a change: **n/a**');
  });

  it('drafts a writing page the site can build, with every figure filled and the gaps marked', () => {
    const draft = formatReportDraft(tally, tallyQuarter(LOG, CATALOG, '2026-Q3'), '2027-01-02');
    const { meta, body } = parseFrontmatter(draft);
    expect(meta).toMatchObject({
      slug: '2026-q4-state-of-llm-pricing',
      title: 'State of LLM Pricing, Q4 2026',
      published: '2027-01-02',
    });
    expect(meta.description).toBe(
      'Every LLM price change PromptSpend recorded in Q4 2026: 4 rate changes across 2 models, 3 up and 1 down, 2 new models and 2 retirements.',
    );
    expect(body).toContain('**DRAFT FROM A PARTIAL QUARTER.**');
    expect(body).toContain('- Rate changes: **4** across 2 models (1 across 1 in Q3 2026)');
    expect(body).toContain('- 2026-10-02: `b-two` output $2 → $4 per million tokens (**+100%**)');
    expect(body).toContain('- `b-two` (Bolt): introductory rate ended 2026-10-15');
    expect(body).toContain('- `c-three` (Acme): introductory rate ends 2026-12-31');
    expect(body).toContain('**TODO:**');
    // Only what prose.ts renders: no tables, no blockquotes, no list item spread over two lines.
    const html = renderMarkdown(body);
    expect(html).not.toMatch(/<p>[|>]/);
    expect(html).toContain('<h2>The quarter in numbers</h2>');
    const complete = formatReportDraft(tallyQuarter(LOG, CATALOG, '2026-Q3'), tally, '2026-10-01');
    expect(complete).not.toContain('PARTIAL QUARTER');
  });

  it('reproduces the published monthly reports from the real log, summed into Q3 2026', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../docs/pricing-changelog.md'), 'utf8');
    const catalog = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
    ) as CatalogSnapshot;
    const q3 = tallyQuarter(text, catalog, '2026-Q3');
    // The September report's figures, plus the August ones as corrected in it. The log is append-only.
    expect(q3.months[2]!.byKind).toMatchObject({
      Review: 299,
      Metadata: 30,
      Coverage: 16,
      Price: 7,
      Added: 6,
    });
    expect(q3.months[1]!.byKind).toMatchObject({
      Review: 255,
      Price: 77,
      Added: 76,
      Coverage: 31,
      Metadata: 26,
      Provider: 5,
      Corrected: 1,
    });
    expect(q3.byKind).toMatchObject({ Review: 554, Price: 84, Added: 82, Coverage: 47, Metadata: 56 });
    expect(q3.quarterIsComplete).toBe(true);
  });
});
