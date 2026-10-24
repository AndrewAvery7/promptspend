import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findAvailable, renderReport, type WatchItem } from './later-additions';

const row = (input: number, output: number, mode = 'chat') => ({
  mode,
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
});

const STEPFUN: WatchItem = {
  id: 'stepfun',
  kind: 'lab',
  label: 'StepFun (Step)',
  feedKey: '^stepfun/',
  vendorPage: 'https://platform.stepfun.ai/docs/en/guides/pricing/details',
  note: 'Needs a new provider.',
};
const FLASHX: WatchItem = {
  id: 'zai-glm-5-3-flashx',
  kind: 'model',
  label: 'Z.ai GLM-5.3-FlashX',
  feedKey: '^zai/glm-5\\.3-flashx$',
  vendorPage: 'https://docs.z.ai/guides/overview/pricing',
  note: 'Widen the Z.ai pattern first.',
};

describe('findAvailable', () => {
  it('reports a first-party row with the feed price per million tokens', () => {
    const found = findAvailable({ 'stepfun/step-5-preview': row(1, 2.7) }, [STEPFUN, FLASHX], new Set());
    expect(found).toHaveLength(1);
    expect(found[0]?.item.id).toBe('stepfun');
    expect(found[0]?.rows).toEqual([
      { key: 'stepfun/step-5-preview', inputPerMillion: 1, outputPerMillion: 2.7 },
    ]);
  });

  it('does not count a copy of the same model sold by someone else', () => {
    const feed = {
      'novita/stepfun/step-3.7-flash': row(0.2, 1.15),
      'tencent/glm-5.3-flashx': row(0.37, 1.25),
      'aihubmix/step-3.7-flash': row(0.2, 1.15),
    };
    expect(findAvailable(feed, [STEPFUN, FLASHX], new Set())).toEqual([]);
  });

  it('stops listing anything already in the catalogue', () => {
    const feed = { 'zai/glm-5.3-flashx': row(0.37, 1.25), 'stepfun/step-5-preview': row(1, 2.7) };
    const found = findAvailable(feed, [STEPFUN, FLASHX], new Set(['zai-glm-5.3-flashx']));
    expect(found.map((entry) => entry.item.id)).toEqual(['stepfun']);
  });

  it('ignores rows a price comparison could not use', () => {
    const feed = {
      'stepfun/step-embed': row(0.1, 0, 'embedding'),
      'stepfun/step-free': row(0, 0),
      'stepfun/step-broken': { mode: 'chat', input_cost_per_token: 'free', output_cost_per_token: 1 },
      'stepfun/step-negative': row(-1, 1),
      'stepfun/step-empty': null,
    };
    expect(findAvailable(feed, [STEPFUN], new Set())).toEqual([]);
  });

  it('lists rows in a stable order', () => {
    const feed = { 'stepfun/step-b': row(1, 2), 'stepfun/step-a': row(1, 2) };
    expect(findAvailable(feed, [STEPFUN], new Set())[0]?.rows.map((r) => r.key)).toEqual([
      'stepfun/step-a',
      'stepfun/step-b',
    ]);
  });
});

describe('renderReport', () => {
  it('names what appeared, the feed price, the vendor page and what else it needs', () => {
    const found = findAvailable({ 'stepfun/step-5-preview': row(1, 2.7) }, [STEPFUN], new Set());
    const report = renderReport(found, '2026-10-26');
    expect(report).toContain('something the catalogue has been waiting for (checked 2026-10-26)');
    expect(report).toContain('`stepfun/step-5-preview`: feed says $1 in / $2.7 out');
    expect(report).toContain('https://platform.stepfun.ai/docs/en/guides/pricing/details');
    expect(report).toContain('Needs a new provider.');
    expect(report).toContain('Nothing has been added');
  });

  it('counts several things in the plural', () => {
    const feed = { 'stepfun/step-5-preview': row(1, 2.7), 'zai/glm-5.3-flashx': row(0.37, 1.25) };
    const report = renderReport(findAvailable(feed, [STEPFUN, FLASHX], new Set()), '2026-10-26');
    expect(report).toContain('2 things');
  });
});

describe('data/later-additions.json', () => {
  const file = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../data/later-additions.json'), 'utf8'),
  ) as { items: WatchItem[] };

  it('has unique ids, compiling patterns and https vendor pages', () => {
    const ids = file.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of file.items) {
      expect(() => new RegExp(item.feedKey), item.id).not.toThrow();
      expect(item.vendorPage.startsWith('https://'), item.id).toBe(true);
      expect(['lab', 'model']).toContain(item.kind);
      expect(item.note.length, item.id).toBeGreaterThan(0);
    }
  });

  it('anchors every pattern so a hosted copy cannot match', () => {
    for (const item of file.items) expect(item.feedKey.startsWith('^'), item.id).toBe(true);
  });
});
