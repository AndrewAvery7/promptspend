import { DEFAULT_SCENARIO } from '@promptspend/core';

import { readSharedScenario } from '@/lib/sharedScenarioLink';

describe('shared Estimate links', () => {
  test('restores only recognized, bounded scenario values', () => {
    const result = readSharedScenario({
      cache: '0.75',
      cpd: '250',
      ignored: 'SENTINEL_PRIVATE_PROMPT',
      m: 'claude-sonnet-5,gpt-5.2',
      out: '900',
      px: 'system,output,invalid',
      rsn: '1.5',
      sys: '800',
      t: '6',
      usr: '400',
    });

    expect(result?.scenario).toMatchObject({
      cachedInputShare: 0.75,
      conversationsPerDay: 250,
      modelIds: ['claude-sonnet-5', 'gpt-5.2'],
      outputTokens: 900,
      pastedFields: ['system', 'output'],
      reasoningMultiplier: 1.5,
      systemTokens: 800,
      turns: 6,
      userTokens: 400,
    });
    expect(result?.signature).not.toContain('ignored');
    expect(JSON.stringify(result)).not.toContain('SENTINEL_PRIVATE_PROMPT');
  });

  test('ignores unrelated query parameters', () => {
    expect(readSharedScenario({ help: 'estimate', prompt: 'private' })).toBeNull();
  });

  test('clamps malformed and unsafe values through the shared contract', () => {
    const result = readSharedScenario({ m: 'safe-model,<script>', out: '9999999', t: '0' });

    expect(result?.scenario.modelIds).toEqual(['safe-model']);
    expect(result?.scenario.outputTokens).toBe(200_000);
    expect(result?.scenario.turns).toBe(1);
    expect(result?.scenario.monthlyActiveUsers).toBe(DEFAULT_SCENARIO.monthlyActiveUsers);
  });
});
