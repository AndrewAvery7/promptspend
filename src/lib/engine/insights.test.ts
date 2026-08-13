import { buildInsights } from './insights';
import { compareModels, type Scale, type Workload } from './cost';
import type { Model } from '../pricing/types';

const workload: Workload = { outputTokens: 900, systemTokens: 1200, turns: 5, userTokens: 300 };
const scale: Scale = { conversationsPerDay: 1000, monthlyActiveUsers: 500, revenuePerUserPerMonth: 20 };

function model(id: string, input: number, output: number): Model {
  return {
    capabilities: { reasoning: false, vision: false },
    contextWindow: 128000,
    displayName: id,
    id,
    pricing: { cacheWrite: input * 1.25, cachedInput: input * 0.2, input, output },
    provenance: { lastVerified: '2026-08-12', source: 'vendor' },
    providerId: 'test',
    status: 'current',
    tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
  };
}

describe('scenario insights', () => {
  it('returns nothing without a priced model', () => {
    expect(buildInsights([], workload, 20)).toEqual([]);
  });

  it('keeps a single-turn single-model diagnosis focused on output', () => {
    const singleTurn = { ...workload, turns: 1 };
    const rows = compareModels([model('solo', 2, 10)], singleTurn, scale);
    const insights = buildInsights(rows, singleTurn, 0);

    expect(insights.map((insight) => insight.id)).toEqual(['output-share']);
  });

  it('explains history, caching, margin, and price spread from one scenario', () => {
    const rows = compareModels([model('lower cost', 1, 4), model('higher cost', 8, 30)], workload, scale, {
      cachedInputShare: 0.6,
    });
    const insights = buildInsights(rows, workload, 20);
    const ids = insights.map((insight) => insight.id);

    expect(ids).toEqual(
      expect.arrayContaining(['output-share', 'history-share', 'cache-savings', 'margin-spread', 'spread']),
    );
    expect(insights.find((insight) => insight.id === 'spread')?.text).toContain('exact workload');
  });
});
