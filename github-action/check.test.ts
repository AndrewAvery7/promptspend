import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM with no types, so the action needs no build step.
import { evaluate, findModelIds, inForce, parseList, record, renderSummary } from './check.mjs';

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: id.toUpperCase(),
  status: 'current',
  pricing: { input: 1.25, output: 10, cachedInput: 0.125 },
  provenance: { source: 'vendor', lastVerified: '2026-10-29' },
  ...extra,
});

const TODAY = '2026-10-29';

describe('the price check', () => {
  it('records today’s rates, promotion included, and nothing it does not know', () => {
    const promo = model('promo', {
      pricing: { input: 3, output: 15, intro: { input: 2, output: 10, until: '2026-10-29' } },
    });
    expect(record(promo, TODAY).rates).toEqual({ input: 2, output: 10 });
    expect(inForce(promo.pricing, '2026-10-30').input).toBe(3);
  });

  it('passes when nothing moved and fails on a moved rate', () => {
    const lock = { models: { 'gpt-5': record(model('gpt-5'), TODAY) } };
    const same = evaluate({
      lock,
      models: [model('gpt-5')],
      watched: ['gpt-5'],
      failOn: ['change'],
      today: TODAY,
    });
    expect(same.failures).toEqual([]);
    expect(same.rows[0].state).toBe('unchanged');

    const moved = model('gpt-5', { pricing: { input: 1, output: 10, cachedInput: 0.125 } });
    const r = evaluate({ lock, models: [moved], watched: ['gpt-5'], failOn: ['change'], today: TODAY });
    expect(r.failures).toEqual(['gpt-5: price changed (input 1.25 → 1).']);
    expect(r.rows[0].state).toBe('changed');
  });

  it('treats a promotion ending as a change, because it is one to the bill', () => {
    const promo = model('promo', {
      pricing: { input: 3, output: 15, intro: { input: 2, output: 10, until: '2026-10-29' } },
    });
    const lock = { models: { promo: record(promo, TODAY) } };
    const r = evaluate({
      lock,
      models: [promo],
      watched: ['promo'],
      failOn: ['change'],
      today: '2026-10-30',
    });
    expect(r.failures[0]).toContain('input 2 → 3');
  });

  it('fails on a retired model and only warns when told not to fail', () => {
    const gone = model('old', { status: 'deprecated' });
    const strict = evaluate({
      lock: null,
      models: [gone],
      watched: ['old'],
      failOn: ['retired'],
      today: TODAY,
    });
    expect(strict.failures[0]).toContain('retired by its vendor');
    const lax = evaluate({ lock: null, models: [gone], watched: ['old'], failOn: [], today: TODAY });
    expect(lax.failures).toEqual([]);
    expect(lax.warnings[0]).toContain('retired');
  });

  it('reports an unknown id instead of pricing it, and bills an alias as its target', () => {
    const r = evaluate({
      lock: null,
      models: [model('gpt-5'), model('gpt-latest', { aliasOf: 'gpt-5', pricing: { input: 9, output: 9 } })],
      watched: ['nope', 'gpt-latest'],
      failOn: ['change'],
      today: TODAY,
    });
    expect(r.warnings).toContain('nope: not in the PromptSpend catalog, so it is not checked.');
    expect(r.lock.models['gpt-latest'].rates.input).toBe(1.25);
  });

  it('finds quoted catalog ids in code, not words in prose', () => {
    const ids = new Set(['gpt-5', 'claude-sonnet-5']);
    const code = 'client.create(model="gpt-5")\n// GPT-5 is pricey\nconst m = `claude-sonnet-5`;';
    expect([...findModelIds(code, ids)].sort()).toEqual(['claude-sonnet-5', 'gpt-5']);
    expect(parseList('a, b\nb,,c')).toEqual(['a', 'b', 'c']);
  });

  it('summarises the run as a table', () => {
    const r = evaluate({
      lock: null,
      models: [model('gpt-5')],
      watched: ['gpt-5'],
      failOn: [],
      today: TODAY,
    });
    const md = renderSummary(r, { lockfile: 'promptspend.lock.json', wrote: true });
    expect(md).toContain('| `gpt-5` | $1.25 | $10 | current | new |');
    expect(md).toContain('Commit it');
  });
});
