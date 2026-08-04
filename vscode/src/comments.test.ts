import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import { ModelIndex } from './scan';
import { commentSyntaxFor, commentRanges, isInside } from './comments';

let index: ModelIndex;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  index = new ModelIndex(new Catalog(raw));
});

const inPython = (text: string) =>
  index.scan(text, { comments: commentSyntaxFor('python') }).matches.map((m) => m.written);
const inTypeScript = (text: string) =>
  index.scan(text, { comments: commentSyntaxFor('typescript') }).matches.map((m) => m.written);

describe('the defect this file exists for', () => {
  it('does not price a comment that says not to price it', () => {
    // Verbatim from the review screenshot. The annotation landed on the end of
    // this line, contradicting the sentence it was attached to.
    const line = '# ...and this one should be left completely alone. If `o3` here has a price';
    expect(inPython(line)).toEqual([]);
  });

  it('does not price a model discussed in a Python comment', () => {
    expect(inPython('# A routing alias. The hover should say it routes to gpt-5.6-sol.')).toEqual([]);
    expect(inPython('# the catalog calls this gemini-gemini-2.5-flash, but this')).toEqual([]);
  });

  it('still prices the code on the next line', () => {
    const source = '# we used to call gpt-5 here\nmodel = "claude-sonnet-5"\n';
    expect(inPython(source)).toEqual(['claude-sonnet-5']);
  });

  it('prices code and skips a trailing comment on the same line', () => {
    expect(inPython('model = "claude-sonnet-5"  # was gpt-5 until last quarter')).toEqual([
      'claude-sonnet-5',
    ]);
  });
});

describe('comment syntax per language', () => {
  it('treats # as a comment in Python but not in TypeScript', () => {
    // `#` is a private-field sigil in TypeScript. A shared default would silence
    // every line containing `this.#count`.
    expect(inTypeScript('const model = "gpt-5"; // #gpt-5 mentioned')).toEqual(['gpt-5']);
    expect(inTypeScript('class A { #gpt = "gpt-5" }')).toEqual(['gpt-5']);
  });

  it('handles line and block comments in TypeScript', () => {
    expect(inTypeScript('// switched from gpt-5\nconst m = "claude-sonnet-5";')).toEqual(['claude-sonnet-5']);
    expect(inTypeScript('/* gpt-5 was here\n   and gpt-5.6 too */\nconst m = "o3";')).toEqual(['o3']);
  });

  it('leaves an unknown language fully annotated rather than half-skipped', () => {
    // Annotating a little too much in a language nobody mapped beats silently
    // dropping half the matches in one that looks supported.
    expect(commentSyntaxFor('haskell')).toBeUndefined();
    expect(index.scan('-- gpt-5', { comments: undefined }).matches).toHaveLength(1);
  });
});

describe('string state', () => {
  it('does not treat a # inside a string as starting a comment', () => {
    const source = 'URL = "https://example.com/#frag"\nMODEL = "gpt-5"\n';
    expect(inPython(source)).toEqual(['gpt-5']);
  });

  it('does not treat a // inside a string as starting a comment', () => {
    expect(inTypeScript('const u = "https://x.dev"; const m = "gpt-5";')).toEqual(['gpt-5']);
  });

  it('honours backslash escapes inside strings', () => {
    expect(inPython('A = "a\\"# not a comment"\nM = "gpt-5"\n')).toEqual(['gpt-5']);
  });
});

describe('known limitation, recorded rather than hidden', () => {
  it('DOES annotate a model named in a Python docstring', () => {
    // Docstrings are strings, not comments. Treating them as comments would
    // silence `MODEL = """gpt-5"""`, which is real if unusual code, and that
    // failure would be invisible. This test is the record of the trade.
    const source = '"""We moved to gpt-5 last quarter."""\n';
    expect(inPython(source)).toEqual(['gpt-5']);
  });
});

describe('commentRanges', () => {
  const python = commentSyntaxFor('python')!;

  it('reports an unterminated block comment as running to end of file', () => {
    const ts = commentSyntaxFor('typescript')!;
    const text = 'const a = 1;\n/* never closed\nmore text';
    const ranges = commentRanges(text, ts);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]![1]).toBe(text.length);
  });

  it('returns ranges in order so the binary search is valid', () => {
    const ranges = commentRanges('# one\nx = 1  # two\n# three\n', python);
    expect(ranges.length).toBeGreaterThan(1);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i]![0]).toBeGreaterThanOrEqual(ranges[i - 1]![1]);
    }
  });
});

describe('isInside', () => {
  const ranges = [
    [0, 5],
    [10, 20],
    [30, 31],
  ] as const;

  it('finds offsets within a range', () => {
    expect(isInside(ranges, 0)).toBe(true);
    expect(isInside(ranges, 15)).toBe(true);
    expect(isInside(ranges, 30)).toBe(true);
  });

  it('excludes the end offset and everything outside', () => {
    expect(isInside(ranges, 5)).toBe(false);
    expect(isInside(ranges, 25)).toBe(false);
    expect(isInside(ranges, 31)).toBe(false);
    expect(isInside([], 0)).toBe(false);
  });
});
