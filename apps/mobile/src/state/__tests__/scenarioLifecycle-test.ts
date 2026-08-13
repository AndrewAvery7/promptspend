import type { SavedScenario } from '@/state/useLaunchState';
import {
  duplicateSavedScenario,
  normalizeScenarioName,
  renameSavedScenarios,
} from '@/state/scenarioLifecycle';

const scenario: SavedScenario = {
  batchEnabled: false,
  cacheEnabled: false,
  cacheSharePercent: 60,
  comparisonIds: ['model-a', 'model-b'],
  id: 'scenario-a',
  name: 'Support assistant',
  pastedFields: ['system'],
  reasoningMultiplier: 1,
  savedAt: '2026-08-12T12:00:00.000Z',
  selectedId: 'model-a',
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

describe('saved scenario lifecycle', () => {
  test('normalizes blank and overlong names', () => {
    expect(normalizeScenarioName('   ')).toBe('Untitled scenario');
    expect(normalizeScenarioName(`  ${'x'.repeat(100)}  `)).toHaveLength(80);
  });

  test('renames only the requested scenario without mutating the original', () => {
    const other = { ...scenario, id: 'scenario-b', name: 'Other' };
    const result = renameSavedScenarios([scenario, other], scenario.id, '  Renamed  ');

    expect(result.map((item) => item.name)).toEqual(['Renamed', 'Other']);
    expect(scenario.name).toBe('Support assistant');
  });

  test('duplicates nested arrays and workload without adding private text', () => {
    const duplicate = duplicateSavedScenario(scenario, 'scenario-copy', '2026-08-12T13:00:00.000Z');

    expect(duplicate).toMatchObject({ id: 'scenario-copy', name: 'Support assistant copy' });
    expect(duplicate.comparisonIds).not.toBe(scenario.comparisonIds);
    expect(duplicate.workload).not.toBe(scenario.workload);
    expect(duplicate.pastedFields).not.toBe(scenario.pastedFields);
    expect(JSON.stringify(duplicate)).not.toContain('SENTINEL_PRIVATE_PROMPT');
  });
});
