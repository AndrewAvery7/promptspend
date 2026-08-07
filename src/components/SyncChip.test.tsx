import { describe, expect, it } from 'vitest';
import { shortDate, syncChipContent, syncChipSentence } from './SyncChip';
import type { Freshness } from '@/lib/pricing/catalog';

const at = (level: Freshness['level'], checkedOn: string | null, ageDays: number | null): Freshness => ({
  level,
  checkedOn,
  ageDays,
});

describe('shortDate', () => {
  it('renders an ISO date without going through Date', () => {
    expect(shortDate('2026-08-06')).toBe('6 Aug');
    expect(shortDate('2026-01-31')).toBe('31 Jan');
  });

  /**
   * `new Date('2026-08-06')` is midnight UTC, which is the 5th for every
   * reader west of Greenwich. A freshness label that is off by a day for a
   * third of the audience is the exact quiet wrongness this chip exists to
   * avoid, so the parse is done by hand.
   */
  it('does not shift by a day for readers behind UTC', () => {
    const original = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = () => 480; // UTC-8
    try {
      expect(shortDate('2026-08-06')).toBe('6 Aug');
    } finally {
      Date.prototype.getTimezoneOffset = original;
    }
  });
});

describe('syncChipContent', () => {
  it('says both things: how recently it was checked, and whether prices moved', () => {
    expect(syncChipContent(at('fresh', '2026-08-06', 0), null)).toEqual({
      level: 'fresh',
      checked: 'CHECKED TODAY',
      prices: 'NO PRICE CHANGE RECORDED',
    });
  });

  it('names the date once a check is not from today', () => {
    expect(syncChipContent(at('aging', '2026-08-04', 2), '2026-08-04')).toEqual({
      level: 'aging',
      checked: 'CHECKED 4 Aug',
      prices: 'PRICES CHANGED 4 Aug',
    });
  });

  it('reframes a stale check as the last clean one', () => {
    expect(syncChipContent(at('stale', '2026-08-01', 5), null).checked).toBe('LAST CLEAN CHECK 1 Aug');
  });

  /**
   * The rule worth keeping above all the others: when the health manifest did
   * not load, the chip must not imply a verdict. Green by default is how a
   * dead pipeline goes unnoticed.
   */
  it('never claims freshness it cannot evidence', () => {
    const unknown = syncChipContent(at('unknown', null, null), null);
    expect(unknown.level).toBe('unknown');
    expect(unknown.checked).toBe('CHECK STATUS UNAVAILABLE');
    expect(unknown.checked).not.toMatch(/CHECKED/);
  });

  it('falls back to unknown if a level arrives without a date', () => {
    expect(syncChipContent(at('fresh', null, null), null).level).toBe('unknown');
  });
});

describe('syncChipSentence', () => {
  it('reads as a sentence rather than two shouted fragments', () => {
    expect(syncChipSentence(syncChipContent(at('fresh', '2026-08-06', 0), null))).toBe(
      'Sources checked today. no price change recorded.',
    );
    expect(syncChipSentence(syncChipContent(at('stale', '2026-08-01', 5), null))).toMatch(
      /^Sources may be out of date:/,
    );
  });
});
