import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatTally, parseChangelog, parsePriceMove, previousMonth, tallyMonth } from './changelog-tally';

const LOG = `# Pricing changelog

## 2026-09-30

- **Price** \`model-a\` — input down 4 → 3
- **Price** \`model-a\` — output down 20 → 10
- **Price** \`model-b\` — cachedInput up 0.1 → 0.15
- **Added** \`model-c\` — Model C ($1 in / $2 out per 1M)
- **Metadata** \`model-b\` — status: current → deprecated
- **Review** \`model-b\` — provenance.needsReview: — → true

## 2026-10-01

- **Price** \`model-a\` — input up 3 → 6
- **Corrected** \`provenance.lastChanged\` removed from all 70 models. Every row had it.
`;

describe('the changelog tally', () => {
  it('reads each entry with the date of the heading it sits under', () => {
    const entries = parseChangelog(LOG);
    expect(entries).toHaveLength(8);
    expect(entries[0]).toEqual({
      date: '2026-09-30',
      kind: 'Price',
      id: 'model-a',
      detail: 'input down 4 → 3',
    });
    expect(entries[7]!.kind).toBe('Corrected');
    expect(entries[7]!.date).toBe('2026-10-01');
  });

  it('turns a rate move into a signed change, and ignores details that are not one', () => {
    const [down, , up, , , review] = parseChangelog(LOG);
    expect(parsePriceMove(down!)).toMatchObject({ field: 'input', from: 4, to: 3, change: -0.25 });
    expect(parsePriceMove(up!)!.change).toBeCloseTo(0.5);
    expect(parsePriceMove(review!)).toBeNull();
  });

  it('counts one whole month by kind, and says how many models had a price move', () => {
    const tally = tallyMonth(parseChangelog(LOG), '2026-09');
    expect(tally.byKind).toMatchObject({ Price: 3, Added: 1, Metadata: 1, Review: 1, Corrected: 0 });
    expect(tally.pricedModels).toEqual(['model-a', 'model-b']);
    expect(tally.added).toEqual(['model-c']);
    expect(tally.metadataByField).toEqual({ status: 1 });
  });

  it('knows a month is complete only once the log has reached the next one', () => {
    const entries = parseChangelog(LOG);
    expect(tallyMonth(entries, '2026-09').monthIsComplete).toBe(true);
    expect(tallyMonth(entries, '2026-10').monthIsComplete).toBe(false);
    expect(formatTally(tallyMonth(entries, '2026-10'), tallyMonth(entries, '2026-09'))).toContain(
      'is not complete',
    );
  });

  it('steps back a month across a year boundary and rejects a bad month', () => {
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(() => tallyMonth([], '2026-13')).toThrow(/not a month/);
  });

  it('reproduces the published September 2026 report from the real log', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../docs/pricing-changelog.md'), 'utf8');
    const tally = tallyMonth(parseChangelog(text), '2026-09');
    // The figures the September report printed. The log is append-only, so they cannot drift.
    expect(tally.byKind).toMatchObject({ Review: 299, Metadata: 30, Coverage: 16, Price: 7, Added: 6 });
    expect(tally.pricedModels).toHaveLength(2);
  });
});
