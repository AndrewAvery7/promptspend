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

const activeDraft = {
  batchEnabled: scenario.batchEnabled,
  cacheEnabled: scenario.cacheEnabled,
  cacheSharePercent: scenario.cacheSharePercent,
  comparisonIds: scenario.comparisonIds,
  pastedFields: scenario.pastedFields,
  reasoningMultiplier: scenario.reasoningMultiplier,
  selectedId: scenario.selectedId,
  workload: scenario.workload,
};

describe('launch persistence', () => {
  test.each(['not-a-date', '', null])(
    'keeps a useful scenario when its date metadata is malformed: %s',
    (savedAt) => {
      const parsed = parsePersistedLaunchState({
        version: 2,
        favorites: [],
        savedScenarios: [{ ...scenario, savedAt }],
      });
      expect(parsed?.savedScenarios).toHaveLength(1);
      expect(parsed?.savedScenarios[0]).toMatchObject({
        id: scenario.id,
        workload: scenario.workload,
        savedAt: '',
      });
    },
  );
  test('serializes only safe launch fields and never prompt text', () => {
    const persisted = createPersistedLaunchState({
      activeDraft,
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
    });
    const serialized = JSON.stringify(persisted);

    expect(serialized).not.toContain('SENTINEL_PRIVATE_PROMPT');
    expect(persisted).toEqual({
      activeDraft,
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
      version: 3,
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
      activeDraft: null,
      favorites: ['claude-sonnet-5'],
      onboardingComplete: true,
      savedScenarios: [scenario],
      version: 3,
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

    expect(parsed?.version).toBe(3);
    expect(parsed?.activeDraft).toBeNull();
    expect(parsed?.savedScenarios[0]?.pastedFields).toEqual([]);
  });

  test.each([null, {}, { version: 4 }, 'corrupt'])('rejects unsupported storage payloads: %p', (value) => {
    expect(parsePersistedLaunchState(value)).toBeNull();
  });

  test('caps persisted collections to protect startup', () => {
    const input: PersistedLaunchState = {
      activeDraft,
      favorites: Array.from({ length: 120 }, (_, index) => `model-${index}`),
      onboardingComplete: false,
      savedScenarios: Array.from({ length: 60 }, (_, index) => ({
        ...scenario,
        id: `scenario-${index}`,
      })),
      version: 3,
    };

    const parsed = parsePersistedLaunchState(input);
    expect(parsed?.favorites).toHaveLength(100);
    expect(parsed?.savedScenarios).toHaveLength(50);
  });

  test('restores a safe active draft while dropping injected private text', () => {
    const parsed = parsePersistedLaunchState({
      activeDraft: {
        ...activeDraft,
        promptText: 'SENTINEL_PRIVATE_PROMPT',
        workload: { ...activeDraft.workload, promptText: 'SENTINEL_PRIVATE_PROMPT' },
      },
      favorites: [],
      onboardingComplete: true,
      savedScenarios: [],
      version: 3,
    });

    expect(parsed?.activeDraft).toEqual(activeDraft);
    expect(JSON.stringify(parsed)).not.toContain('SENTINEL_PRIVATE_PROMPT');
  });

  test.each([
    ['cache share', { cacheSharePercent: 101 }],
    ['reasoning multiplier', { reasoningMultiplier: 0 }],
    ['turn count', { workload: { ...scenario.workload, turns: 0 } }],
    ['token count', { workload: { ...scenario.workload, outputTokens: 200_001 } }],
  ])('drops a scenario with an out-of-range %s', (_label, override) => {
    const parsed = parsePersistedLaunchState({
      favorites: [],
      onboardingComplete: true,
      savedScenarios: [{ ...scenario, ...override }],
      version: 2,
    });

    expect(parsed?.savedScenarios).toEqual([]);
  });
});
