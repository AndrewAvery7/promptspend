import { describe, expect, it } from 'vitest';

import type { Model } from '@/lib/pricing/types';
import { compareModels, conversationCost, costAtScale, type Workload } from './cost';
import { buildComparisonShareText, buildEstimateShareText } from './share';

function model(id: string, displayName: string, input: number, output: number): Model {
  return {
    id,
    providerId: 'test-provider',
    displayName,
    status: 'current',
    contextWindow: 200_000,
    pricing: { input, output },
    tokenizer: { kind: 'approx', charsPerToken: 3.8, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-11' },
  };
}

const WORKLOAD: Workload = {
  systemTokens: 800,
  userTokens: 400,
  outputTokens: 900,
  turns: 6,
};

const SCALE = {
  conversationsPerDay: 100,
  monthlyActiveUsers: 1_000,
  revenuePerUserPerMonth: 0,
};

describe('buildEstimateShareText', () => {
  it('shares the result and provenance without user-authored prompt content', () => {
    const selectedModel = model('model-a', 'Model A', 3, 15);
    const breakdown = conversationCost(selectedModel, WORKLOAD);
    const scaled = costAtScale(breakdown.total, SCALE);

    const text = buildEstimateShareText({ breakdown, model: selectedModel, scaled });

    expect(text).toContain('PromptSpend estimate');
    expect(text).toContain('Model: Model A');
    expect(text).toContain('Estimated monthly cost:');
    expect(text).toContain('Per conversation:');
    expect(text).toContain('Tokens per conversation: 26,700 input + 5,400 output');
    expect(text).toContain('Pricing last verified: 2026-08-11');
    expect(text).toContain('https://promptspend.com');
  });
});

describe('buildComparisonShareText', () => {
  it('orders models by monthly cost and identifies the lowest estimate', () => {
    const expensive = model('expensive', 'Premium Model', 5, 20);
    const inexpensive = model('inexpensive', 'Value Model', 0.5, 1);
    const rows = compareModels([expensive, inexpensive], WORKLOAD, SCALE);

    const text = buildComparisonShareText(rows);

    expect(text.indexOf('1. Value Model')).toBeLessThan(text.indexOf('2. Premium Model'));
    expect(text).toContain('Value Model at');
    expect(text).toContain('(lowest estimated cost)');
    expect(text).toContain('The same workload and usage assumptions were applied to every model.');
  });

  it('returns a useful destination when no models are selected', () => {
    expect(buildComparisonShareText([])).toContain('Compare models at https://promptspend.com');
  });
});
