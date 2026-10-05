import { describe, expect, it } from 'vitest';
import { EMPTY_CHECK_REPORT, factCheckFor, nextFactCheck, parseCheckReport } from './check';

const READ = '2026-10-05';

describe('nextFactCheck', () => {
  it('confirms a fact still on its page without calling it a change', () => {
    expect(nextFactCheck(undefined, READ, true, '2026-10-06')).toEqual({
      status: 'confirmed',
      lastConfirmed: '2026-10-06',
    });
  });

  it('dates the day a quote disappears, and keeps the last confirmation', () => {
    const before = { status: 'confirmed' as const, lastConfirmed: '2026-10-06' };
    expect(nextFactCheck(before, READ, false, '2026-10-07')).toEqual({
      status: 'missing',
      lastConfirmed: '2026-10-06',
      changedOn: '2026-10-07',
    });
  });

  it('keeps the original date while a quote stays missing', () => {
    const missing = { status: 'missing' as const, lastConfirmed: '2026-10-06', changedOn: '2026-10-07' };
    expect(nextFactCheck(missing, READ, false, '2026-10-09')).toEqual(missing);
  });

  it('dates the day a missing quote comes back', () => {
    const missing = { status: 'missing' as const, lastConfirmed: '2026-10-06', changedOn: '2026-10-07' };
    expect(nextFactCheck(missing, READ, true, '2026-10-10')).toEqual({
      status: 'confirmed',
      lastConfirmed: '2026-10-10',
      changedOn: '2026-10-10',
    });
  });

  it('treats an unreadable page as saying nothing about the wording', () => {
    const before = { status: 'confirmed' as const, lastConfirmed: '2026-10-06' };
    expect(nextFactCheck(before, READ, null, '2026-10-07')).toEqual({
      status: 'unread',
      lastConfirmed: '2026-10-06',
    });
    expect(nextFactCheck(undefined, READ, null, '2026-10-07')).toEqual({
      status: 'unread',
      lastConfirmed: READ,
    });
  });

  it('does not let an unreadable morning hide a known missing quote', () => {
    const missing = { status: 'missing' as const, lastConfirmed: '2026-10-06', changedOn: '2026-10-07' };
    expect(nextFactCheck(missing, READ, null, '2026-10-08').status).toBe('missing');
  });

  it('starts afresh after a fact is re-read by hand', () => {
    const stale = { status: 'missing' as const, lastConfirmed: '2026-10-06', changedOn: '2026-10-07' };
    expect(nextFactCheck(stale, '2026-10-12', true, '2026-10-13')).toEqual({
      status: 'confirmed',
      lastConfirmed: '2026-10-13',
    });
  });
});

describe('factCheckFor', () => {
  it('falls back to the fact’s own read date before any check has run', () => {
    expect(factCheckFor(EMPTY_CHECK_REPORT, 'x', READ)).toEqual({ status: 'confirmed', lastConfirmed: READ });
  });

  it('prefers a hand re-read over an older check', () => {
    const report = {
      checkedAt: null,
      facts: { x: { status: 'missing' as const, lastConfirmed: '2026-10-01' } },
    };
    expect(factCheckFor(report, 'x', READ)).toEqual({ status: 'confirmed', lastConfirmed: READ });
  });
});

describe('parseCheckReport', () => {
  it('keeps well-formed entries and drops the rest without throwing', () => {
    const report = parseCheckReport({
      checkedAt: '2026-10-06T06:00:00Z',
      facts: {
        good: { status: 'confirmed', lastConfirmed: '2026-10-06' },
        badStatus: { status: 'fine', lastConfirmed: '2026-10-06' },
        badDate: { status: 'missing', lastConfirmed: 'yesterday' },
        notObject: 4,
      },
    });
    expect(Object.keys(report.facts)).toEqual(['good']);
    expect(report.checkedAt).toBe('2026-10-06T06:00:00Z');
  });

  it('returns the empty report for anything that is not an object', () => {
    expect(parseCheckReport(null)).toEqual(EMPTY_CHECK_REPORT);
    expect(parseCheckReport('x')).toEqual(EMPTY_CHECK_REPORT);
  });
});
