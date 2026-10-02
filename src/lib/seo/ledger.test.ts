import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  changedPaths,
  fingerprint,
  hashString,
  ledgerDrift,
  parseLedger,
  recordedPairs,
  resolveLastmod,
  serializeLedger,
  updateLedger,
  type PageLedger,
} from './ledger';

const LEDGER: PageLedger = {
  '/models/gpt-5/': { published: '2026-08-02', lastmod: '2026-08-16', fingerprint: 'aaa' },
  '/compare/a-vs-b/': {
    published: '2026-08-02',
    lastmod: '2026-08-02',
    fingerprint: 'bbb',
    left: 'a',
    right: 'b',
  },
};

describe('fingerprint', () => {
  it('does not depend on the order keys were written in', () => {
    // The sync rewrites rows; a reordered object is the same content and must
    // not re-date the page.
    expect(fingerprint({ input: 1, output: 4 })).toBe(fingerprint({ output: 4, input: 1 }));
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: [3, 1] })).toBe('{"a":[3,1],"b":{"c":2,"d":1}}');
  });

  it('moves when the content does', () => {
    expect(fingerprint({ input: 1, output: 4 })).not.toBe(fingerprint({ input: 1, output: 4.5 }));
  });

  it('is a fixed-width hex string', () => {
    expect(hashString('')).toMatch(/^[0-9a-f]{14}$/);
    expect(hashString('promptspend')).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('resolveLastmod', () => {
  it('keeps the recorded date while the content is unchanged', () => {
    expect(resolveLastmod(LEDGER, '/models/gpt-5/', 'aaa', '2026-10-02')).toBe('2026-08-16');
  });

  it('dates a changed page, and a page never recorded, to the build', () => {
    expect(resolveLastmod(LEDGER, '/models/gpt-5/', 'zzz', '2026-10-02')).toBe('2026-10-02');
    expect(resolveLastmod(LEDGER, '/models/new/', 'ccc', '2026-10-02')).toBe('2026-10-02');
    expect(resolveLastmod(undefined, '/models/new/', 'ccc', '2026-10-02')).toBe('2026-10-02');
  });
});

describe('updateLedger', () => {
  it('records new pages, re-dates changed ones and leaves the rest alone', () => {
    const next = updateLedger(
      LEDGER,
      [
        { path: '/models/gpt-5/', fingerprint: 'aaa' },
        { path: '/compare/a-vs-b/', fingerprint: 'changed', leftSlug: 'a', rightSlug: 'b' },
        { path: '/models/new/', fingerprint: 'ccc' },
      ],
      '2026-10-02',
    );

    expect(next['/models/gpt-5/']).toEqual(LEDGER['/models/gpt-5/']);
    expect(next['/compare/a-vs-b/']).toEqual({
      published: '2026-08-02',
      lastmod: '2026-10-02',
      fingerprint: 'changed',
      left: 'a',
      right: 'b',
    });
    expect(next['/models/new/']).toEqual({
      published: '2026-10-02',
      lastmod: '2026-10-02',
      fingerprint: 'ccc',
    });
  });

  it('never forgets a page that stopped being built', () => {
    const next = updateLedger(LEDGER, [], '2026-10-02');
    expect(Object.keys(next)).toEqual(Object.keys(LEDGER).sort());
  });

  it('is idempotent, so running --fix twice writes the same file', () => {
    const pages = [{ path: '/models/new/', fingerprint: 'ccc' }];
    const once = updateLedger(LEDGER, pages, '2026-10-02');
    const twice = updateLedger(once, pages, '2026-10-03');
    expect(serializeLedger(twice)).toBe(serializeLedger(once));
  });
});

describe('ledgerDrift', () => {
  it('names every page the ledger has not recorded as built', () => {
    expect(
      ledgerDrift(LEDGER, [
        { path: '/models/gpt-5/', fingerprint: 'aaa' },
        { path: '/models/gpt-5-mini/', fingerprint: 'x' },
        { path: '/compare/a-vs-b/', fingerprint: 'moved' },
      ]),
    ).toEqual(['/compare/a-vs-b/', '/models/gpt-5-mini/']);
  });
});

describe('changedPaths', () => {
  it('lists pages whose lastmod moved and pages that are new, and nothing else', () => {
    const next = updateLedger(
      LEDGER,
      [
        { path: '/models/gpt-5/', fingerprint: 'aaa' },
        { path: '/compare/a-vs-b/', fingerprint: 'changed', leftSlug: 'a', rightSlug: 'b' },
        { path: '/models/new/', fingerprint: 'ccc' },
      ],
      '2026-10-02',
    );
    expect(changedPaths(LEDGER, next)).toEqual(['/compare/a-vs-b/', '/models/new/']);
    expect(changedPaths(next, next)).toEqual([]);
  });
});

describe('recordedPairs', () => {
  it('returns the comparison entries with their two slugs, and not the index', () => {
    const ledger: PageLedger = {
      ...LEDGER,
      '/compare/': { published: '2026-08-02', lastmod: '2026-08-02', fingerprint: 'i' },
    };
    expect(recordedPairs(ledger)).toEqual([
      { path: '/compare/a-vs-b/', slug: 'a-vs-b', left: 'a', right: 'b' },
    ]);
    expect(recordedPairs(undefined)).toEqual([]);
  });
});

describe('parseLedger', () => {
  it('round-trips what serializeLedger writes', () => {
    expect(parseLedger(JSON.parse(serializeLedger(LEDGER)))).toEqual(LEDGER);
  });

  it('refuses a malformed file rather than building as if it were empty', () => {
    expect(() => parseLedger({})).toThrow(/pages/);
    expect(() =>
      parseLedger({ pages: { '/x/': { published: 'yesterday', lastmod: '2026-08-02', fingerprint: 'a' } } }),
    ).toThrow(/date/);
    expect(() =>
      parseLedger({
        pages: { '/x/': { published: '2026-08-02', lastmod: '2026-08-02', fingerprint: 'a', left: 'a' } },
      }),
    ).toThrow(/one side/);
    expect(() =>
      parseLedger({ pages: { x: { published: '2026-08-02', lastmod: '2026-08-02', fingerprint: 'a' } } }),
    ).toThrow(/path/);
  });
});
