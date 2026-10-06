import { describe, expect, it } from 'vitest';
import { applyEdits, browserStrayEdits, claimEdits, tableEdits } from './test-count-fix';

const BADGE = /badge\/tests-(\d+)-/g;
const ANY = /(\d+)(?:\s+[a-z]+){0,4}\s+tests?\b/gi;
const ROW = /^\| `([^`]+\.test\.tsx?)`\s*\| (\d+)\s*\|/gm;

describe('claimEdits', () => {
  it('changes only the figures that are wrong, at every occurrence', () => {
    const text = 'a badge/tests-1298-blue.svg b badge/tests-1372-blue.svg c badge/tests-1298-blue.svg';
    const out = applyEdits(text, claimEdits(text, BADGE, 1372));
    expect(out).toBe('a badge/tests-1372-blue.svg b badge/tests-1372-blue.svg c badge/tests-1372-blue.svg');
  });

  it('is idempotent: a corrected document needs no further edits', () => {
    const text = 'badge/tests-1372-blue';
    expect(
      claimEdits(applyEdits(text, claimEdits('badge/tests-1298-blue', BADGE, 1372)), BADGE, 1372),
    ).toEqual([]);
    expect(claimEdits(text, BADGE, 1372)).toEqual([]);
  });

  it('handles a figure that gains a digit', () => {
    const text = 'badge/tests-999-blue and badge/tests-999-blue';
    expect(applyEdits(text, claimEdits(text, BADGE, 1000))).toBe(
      'badge/tests-1000-blue and badge/tests-1000-blue',
    );
  });
});

describe('tableEdits', () => {
  const table = [
    '| `src/a.test.ts` | 5     | one |',
    '| `src/b.test.ts` | 12    | two |',
    '| `src/gone.test.ts` | 3     | deleted |',
  ].join('\n');

  it('follows the real count and leaves rows it cannot judge alone', () => {
    const real = new Map([
      ['src/a.test.ts', 6],
      ['src/b.test.ts', 12],
      ['src/new.test.ts', 4],
    ]);
    const out = applyEdits(table, tableEdits(table, ROW, real));
    expect(out).toContain('| `src/a.test.ts` | 6     | one |');
    expect(out).toContain('| `src/b.test.ts` | 12    | two |');
    expect(out).toContain('| `src/gone.test.ts` | 3     | deleted |');
    expect(out).not.toContain('new.test.ts');
  });
});

describe('browserStrayEdits', () => {
  const permitted = new Map([
    [1379, 'in all'],
    [192, 'the browser'],
  ]);

  it('rewrites only prose that names the browser suite', () => {
    const text = 'landed: 168 browser tests at four viewports. Also 50 tests of something.';
    const out = applyEdits(text, browserStrayEdits(text, ANY, 192, permitted));
    expect(out).toBe('landed: 192 browser tests at four viewports. Also 50 tests of something.');
  });

  it('leaves a figure a suite really reports', () => {
    const text = '192 browser tests and 1379 tests';
    expect(browserStrayEdits(text, ANY, 192, permitted)).toEqual([]);
  });
});

describe('applyEdits', () => {
  it('applies an edit found by two rules once, and keeps later offsets valid', () => {
    const text = 'x 10 y 20 z';
    const edits = [
      { start: 2, end: 4, value: '100' },
      { start: 2, end: 4, value: '100' },
      { start: 7, end: 9, value: '2' },
    ];
    expect(applyEdits(text, edits)).toBe('x 100 y 2 z');
  });
});
