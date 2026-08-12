import {
  createPersistedLaunchState,
  parsePersistedLaunchState,
  type PersistedLaunchState,
} from '@/state/launchPersistence';
import type { SavedScenario } from '@/state/useLaunchState';

const scenario: SavedScenario = {
  batchEnabled: false,
  cacheEnabled: true,
  cacheSharePercent: 50,
  comparisonIds: ['claude-sonnet-5', 'gpt-5.2'],
  id: 'scenario-1',
  name: 'Support assistant',
  pastedFields: ['system'],
  reasoningMultiplier: 1,
  savedAt: '2026-08-12T12:00:00.000Z',
  selectedId: 'claude-sonnet-5',
  workload: {
    conversationsPerDay: 2500,
    monthlyActiveUsers: 1000,
    outputTokens: 700,
    revenuePerUserPerMonth: 0,
    systemTokens: 1200,
    turns: 6,
    userTokens: 280,
  },
};

describe('launch persistence', () => {
  test('serializes only safe launch fields and never prompt text', () => {
    const persisted = createPersistedLaunchState({
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
    });
    const serialized = JSON.stringify(persisted);

    expect(serialized).not.toContain('SENTINEL_PRIVATE_PROMPT');
    expect(persisted).toEqual({
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
      version: 2,
    });
  });

  test('drops unknown fields, malformed entries, and any injected prompt text', () => {
    const injectedScenario = { ...scenario, promptText: 'SENTINEL_PRIVATE_PROMPT' };
    const parsed = parsePersistedLaunchState({
      favorites: ['claude-sonnet-5', 42],
      onboardingComplete: true,
      promptText: 'SENTINEL_PRIVATE_PROMPT',
      savedScenarios: [injectedScenario, { id: 'broken' }],
      version: 2,
    });

    expect(parsed).toEqual({
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
      version: 2,
    });
    expect(JSON.stringify(parsed)).not.toContain('SENTINEL_PRIVATE_PROMPT');
  });

  test('migrates version 1 scenarios without paste markers', () => {
    const legacyScenario: Partial<SavedScenario> = { ...scenario };
    delete legacyScenario.pastedFields;
    const parsed = parsePersistedLaunchState({
      favorites: [],
      onboardingComplete: true,
      savedScenarios: [legacyScenario],
      version: 1,
    });

    expect(parsed?.version).toBe(2);
    expect(parsed?.savedScenarios[0]?.pastedFields).toEqual([]);
  });

  test.each([null, {}, { version: 3 }, 'corrupt'])('rejects unsupported storage payloads: %p', (value) => {
    expect(parsePersistedLaunchState(value)).toBeNull();
  });

  test('caps persisted collections to protect startup', () => {
    const input: PersistedLaunchState = {
      favorites: Array.from({ length: 120 }, (_, index) => `model-${index}`),
      onboardingComplete: false,
      savedScenarios: Array.from({ length: 60 }, (_, index) => ({
        ...scenario,
        id: `scenario-${index}`,
      })),
      version: 2,
    };

    const parsed = parsePersistedLaunchState(input);
    expect(parsed?.favorites).toHaveLength(100);
    expect(parsed?.savedScenarios).toHaveLength(50);
  });
});
