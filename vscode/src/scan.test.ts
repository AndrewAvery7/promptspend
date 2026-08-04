import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import { ModelIndex, MAX_SCAN_CHARS } from './scan';

let index: ModelIndex;
let catalog: Catalog;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
  index = new ModelIndex(catalog);
});

const written = (text: string) => index.scan(text).matches.map((m) => m.written);

describe('real-world fixtures', () => {
  it('finds the model in an Anthropic Python call', () => {
    const python = `
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=4096,
    messages=[{"role": "user", "content": PROMPT}],
)`;
    expect(written(python)).toEqual(['claude-sonnet-5']);
  });

  it('finds the model in a TypeScript OpenAI call', () => {
    const ts = `
const completion = await openai.chat.completions.create({
  model: 'gpt-5.6',
  messages,
});`;
    const result = index.scan(ts);
    expect(result.matches.map((m) => m.written)).toEqual(['gpt-5.6']);
    // gpt-5.6 is a routing alias; the row priced against must be the target,
    // which is the one carrying the long-context tier and batch discount.
    expect(result.matches[0]?.model.id).toBe('gpt-5.6-sol');
    expect(result.matches[0]?.routedFrom?.id).toBe('gpt-5.6');
  });

  it('finds a Google model written the way Google writes it', () => {
    // The catalog calls this `gemini-gemini-2.5-flash`; nobody types that.
    expect(written('model = "gemini-2.5-flash"')).toEqual(['gemini-2.5-flash']);
  });

  it('finds unquoted ids in YAML', () => {
    expect(written('default_model: claude-opus-4-5\nfallback: gpt-5-mini\n')).toEqual([
      'claude-opus-4-5',
      'gpt-5-mini',
    ]);
  });

  it('finds ids in a .env assignment', () => {
    expect(written('OPENAI_MODEL=gpt-5-nano')).toEqual(['gpt-5-nano']);
  });
});

describe('boundaries', () => {
  it('does not match a longer dated snapshot id as its undated prefix', () => {
    // The catalog has claude-sonnet-5 but not claude-sonnet-5-20260101. Pricing
    // the dated id as if it were the undated one would be an invented number.
    expect(written('model="claude-sonnet-5-20260101"')).toEqual([]);
  });

  it('does not match an id embedded in a longer word', () => {
    expect(written('const mygpt-5thing = 1')).toEqual([]);
    expect(written('xgpt-5')).toEqual([]);
  });

  it('prefers the longest id when two overlap', () => {
    expect(written('model="gpt-5.6-sol"')).toEqual(['gpt-5.6-sol']);
  });

  it('matches an id followed by punctuation', () => {
    expect(written('["gpt-5", "o3"]')).toEqual(['gpt-5', 'o3']);
  });
});

describe('short ids', () => {
  it('matches o3 when it is the whole string literal', () => {
    expect(written('model="o3"')).toEqual(['o3']);
    expect(written("model='o3'")).toEqual(['o3']);
  });

  it('does not match a bare o3 used as an identifier', () => {
    expect(written('let o3 = compute()')).toEqual([]);
    expect(written('for o1 in items:')).toEqual([]);
  });

  it('still matches longer ids without quotes', () => {
    expect(written('o3-mini')).toEqual(['o3-mini']);
  });
});

describe('quiet by default', () => {
  it('DOES match a model named in prose — which is why the allowlist exists', () => {
    // Recorded as a real result rather than asserted away. The scanner has no
    // concept of prose and should not pretend to: a changelog line reading
    // "moved from gpt-5 to gpt-5.6" is indistinguishable from source at this
    // level. Keeping markdown and plain text quiet is the language allowlist's
    // job in extension.ts, and this test is what stops someone assuming the
    // scanner already handled it.
    expect(written('We moved from gpt-5 to gpt-5.6 last quarter.')).toEqual(['gpt-5', 'gpt-5.6']);
  });

  it('skips a document past the size cap instead of scanning it slowly', () => {
    const huge = 'x'.repeat(MAX_SCAN_CHARS + 1);
    const result = index.scan(huge);
    expect(result.skipped).toBe(true);
    expect(result.matches).toEqual([]);
  });
});

describe('index', () => {
  it('covers every model in the catalog', () => {
    // Every catalog id must be findable by at least its own name, or the model
    // is in the catalog and invisible in the editor.
    for (const model of catalog.models) {
      expect(index.lookup(model.id), `${model.id} is not in the scan index`).toBeDefined();
    }
  });

  it('recognises more written forms than there are models', () => {
    // The stripped forms are the difference. If this ever equals the model
    // count, prefix stripping has silently stopped happening.
    expect(index.size).toBeGreaterThan(catalog.models.length);
  });
});
