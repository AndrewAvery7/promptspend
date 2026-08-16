import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import { ModelIndex } from './scan';
import { commentSyntaxFor } from './comments';
import { buildInventory, lineStartsOf, lineAt, type ScannedFile } from './inventory';
import { languageIdForPath, SCAN_GLOB, DEFAULT_LANGUAGES, EXTENSION_LANGUAGE } from './config';

let index: ModelIndex;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  index = new ModelIndex(new Catalog(raw));
});

const scanned = (path: string, text: string): ScannedFile => ({
  path,
  uri: `file:///workspace/${path}`,
  matches: index.scan(text, { comments: commentSyntaxFor('python') }).matches,
  lineStarts: lineStartsOf(text),
});

describe('line numbers', () => {
  it('maps offsets to the line they fall on', () => {
    const text = 'a\nbb\nccc\n';
    const starts = lineStartsOf(text);
    expect(lineAt(starts, 0)).toBe(0);
    expect(lineAt(starts, 1)).toBe(0);
    expect(lineAt(starts, 2)).toBe(1);
    expect(lineAt(starts, 5)).toBe(2);
  });

  it('handles a file with no trailing newline', () => {
    const starts = lineStartsOf('one\ntwo');
    expect(lineAt(starts, 6)).toBe(1);
  });

  it('reports the right line for a real match', () => {
    const file = scanned('a.py', 'x = 1\ny = 2\nmodel = "gpt-5"\n');
    const inventory = buildInventory([file]);
    expect(inventory.usage[0]?.references[0]?.line).toBe(2);
  });
});

describe('buildInventory', () => {
  it('groups references by model across files', () => {
    const inventory = buildInventory([
      scanned('a.py', 'model = "gpt-5"'),
      scanned('b.py', 'model = "gpt-5"\nother = "gpt-5"'),
    ]);
    expect(inventory.usage).toHaveLength(1);
    expect(inventory.usage[0]?.references).toHaveLength(3);
    expect(inventory.usage[0]?.fileCount).toBe(2);
  });

  it('orders by output rate, not by how often a model appears', () => {
    // The view is about money. A model called once in a batch job can cost more
    // than one called all over a test suite.
    const inventory = buildInventory([
      scanned('cheap.py', Array.from({ length: 20 }, () => '"gpt-5-nano"').join('\n')),
      scanned('dear.py', '"claude-opus-4-5"'),
    ]);
    const rates = inventory.usage.map((u) => u.model.pricing.output);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
    expect(inventory.usage[0]?.references).toHaveLength(1);
  });

  it('resolves a routing alias to the row it is priced against', () => {
    const inventory = buildInventory([scanned('a.py', 'model = "gpt-5.6"')]);
    expect(inventory.usage[0]?.model.id).toBe('gpt-5.6-sol');
    expect(inventory.usage[0]?.references[0]?.written).toBe('gpt-5.6');
  });

  it('counts files scanned and files dropped separately', () => {
    const inventory = buildInventory([scanned('a.py', '"gpt-5"')], 37);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.filesSkipped).toBe(37);
  });

  it('returns nothing rather than throwing for an empty sweep', () => {
    expect(buildInventory([]).usage).toEqual([]);
  });
});

describe('languageIdForPath', () => {
  it('maps ordinary extensions', () => {
    expect(languageIdForPath('src/main.py')).toBe('python');
    expect(languageIdForPath('a/b/c.tsx')).toBe('typescriptreact');
    expect(languageIdForPath('config.YAML')).toBe('yaml');
  });

  it('recognises dotenv files, which have no extension in the usual sense', () => {
    expect(languageIdForPath('.env')).toBe('dotenv');
    expect(languageIdForPath('deploy/.env.production')).toBe('dotenv');
  });

  it('ignores files it does not scan', () => {
    expect(languageIdForPath('README.md')).toBeUndefined();
    expect(languageIdForPath('Makefile')).toBeUndefined();
    expect(languageIdForPath('image.png')).toBeUndefined();
  });
});

describe('the sweep and the editor agree on what is scannable', () => {
  it('maps every extension to a language the editor would also annotate', () => {
    // A file the sweep finds but the open editor ignores — or the reverse —
    // would be a difference nobody could explain from the outside.
    for (const [extension, languageId] of Object.entries(EXTENSION_LANGUAGE)) {
      expect(DEFAULT_LANGUAGES, `${extension} maps to ${languageId}, which is not annotated`).toContain(
        languageId,
      );
    }
  });

  it('builds a glob containing every mapped extension', () => {
    for (const extension of Object.keys(EXTENSION_LANGUAGE)) {
      expect(SCAN_GLOB).toContain(extension);
    }
  });
});
