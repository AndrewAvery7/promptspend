import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import { ModelIndex } from './scan';
import { commentSyntaxFor } from './comments';
import { ceilingFor } from './ceiling';

let index: ModelIndex;
let catalog: Catalog;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
  index = new ModelIndex(catalog);
});

/** Scan then take the ceiling of the first match, the way the editor does. */
const first = (text: string, language = 'python') => {
  const { matches } = index.scan(text, { comments: commentSyntaxFor(language) });
  const match = matches[0];
  if (!match) throw new Error('no model matched');
  return { match, ceiling: ceilingFor(text, match, matches) };
};

describe('finding the cap', () => {
  it('reads max_tokens from an Anthropic-shaped call', () => {
    const { match, ceiling } = first(`
client.messages.create(
    model="claude-sonnet-5",
    max_tokens=4096,
)`);
    expect(ceiling?.maxTokens).toBe(4096);
    // The arithmetic, checked independently: 4096 tokens at $15/M output.
    expect(ceiling?.outputCostUsd).toBeCloseTo((4096 / 1_000_000) * match.model.pricing.output, 10);
  });

  it('reads camelCase maxOutputTokens', () => {
    const { ceiling } = first(
      'const r = await gen({ model: "gemini-2.5-flash", maxOutputTokens: 8192 });',
      'typescript',
    );
    expect(ceiling?.maxTokens).toBe(8192);
  });

  it('reads max_completion_tokens', () => {
    const { ceiling } = first('model="gpt-5"\nmax_completion_tokens = 1000');
    expect(ceiling?.maxTokens).toBe(1000);
  });

  it('reads a YAML cap written after the model', () => {
    const { ceiling } = first('model: claude-opus-4-5\nmax_tokens: 2048\n', 'yaml');
    expect(ceiling?.maxTokens).toBe(2048);
  });

  it('finds a cap written just above the model', () => {
    const { ceiling } = first('max_tokens=512\nmodel="gpt-5"');
    expect(ceiling?.maxTokens).toBe(512);
  });

  it('reports nothing when there is no cap', () => {
    expect(first('model="gpt-5"').ceiling).toBeUndefined();
  });

  it('ignores a cap too far away to belong to this call', () => {
    const far = `model="gpt-5"\n${'filler\n'.repeat(20)}max_tokens=999\n`;
    expect(first(far).ceiling).toBeUndefined();
  });
});

describe('a cap belongs to exactly one call', () => {
  it('does not let a later call borrow the previous call’s cap', () => {
    // Verbatim from the review file that caught this. The second call has no
    // cap; it was showing 4096 tokens at gpt-5-mini's rate — a real number,
    // correct arithmetic, about a request nobody had written.
    const source = [
      'response = client.messages.create(model="claude-sonnet-5", max_tokens=4096)',
      'completion = openai.chat.completions.create(model="gpt-5-mini")',
    ].join('\n');

    const { matches } = index.scan(source, { comments: commentSyntaxFor('python') });
    expect(matches).toHaveLength(2);
    expect(ceilingFor(source, matches[0]!, matches)?.maxTokens).toBe(4096);
    expect(ceilingFor(source, matches[1]!, matches)).toBeUndefined();
  });

  it('still reads a cap written above the model, which is why backwards exists', () => {
    // Configuration files put the cap first. A distant previous match must not
    // take that away — its forward window runs out before this one's begins.
    const source = [
      'model: gpt-5',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'max_tokens: 512',
      'model: claude-opus-4-5',
    ].join('\n');

    const { matches } = index.scan(source, { comments: commentSyntaxFor('yaml') });
    expect(matches).toHaveLength(2);
    expect(ceilingFor(source, matches[1]!, matches)?.maxTokens).toBe(512);
  });

  it('gives an unambiguous cap above the model to that model', () => {
    const source = 'max_tokens: 256\nmodel: gpt-5\n';
    const { matches } = index.scan(source, { comments: commentSyntaxFor('yaml') });
    expect(ceilingFor(source, matches[0]!, matches)?.maxTokens).toBe(256);
  });
});

describe('two calls in one file', () => {
  it('does not let the second call lend its cap to the first', () => {
    // Without the neighbour bound this was the failure: the first call has no
    // cap of its own, and the forward search would happily walk into the
    // second call's and price it with confidence.
    const source = `
first = client.create(model="claude-sonnet-5")
second = client.create(model="gpt-5", max_tokens=8000)
`;
    const { matches } = index.scan(source, { comments: commentSyntaxFor('python') });
    expect(matches).toHaveLength(2);
    expect(ceilingFor(source, matches[0]!, matches)).toBeUndefined();
    expect(ceilingFor(source, matches[1]!, matches)?.maxTokens).toBe(8000);
  });
});

describe('impossible requests are named, not priced', () => {
  it('flags a cap above what the model can emit', () => {
    const model = catalog.models.find((m) => m.maxOutput !== undefined && !m.aliasOf);
    expect(model, 'catalog has no model with a published maxOutput').toBeDefined();

    const source = `model="${model!.id}"\nmax_tokens=${model!.maxOutput! + 1}`;
    const { matches } = index.scan(source);
    const ceiling = ceilingFor(source, matches[0]!, matches);
    expect(ceiling?.exceedsModelMax).toBe(true);
  });

  it('does not flag a cap the model can actually meet', () => {
    const model = catalog.models.find((m) => m.maxOutput !== undefined && !m.aliasOf)!;
    const source = `model="${model.id}"\nmax_tokens=${Math.max(1, model.maxOutput! - 1)}`;
    const { matches } = index.scan(source);
    expect(ceilingFor(source, matches[0]!, matches)?.exceedsModelMax).toBe(false);
  });
});

describe('malformed caps', () => {
  it('ignores a zero or negative cap rather than pricing it at nothing', () => {
    expect(first('model="gpt-5"\nmax_tokens=0').ceiling).toBeUndefined();
  });

  it('reads a cap written with underscore separators', () => {
    expect(first('model="gpt-5"\nmax_tokens=100_000').ceiling?.maxTokens).toBe(100_000);
  });
});
