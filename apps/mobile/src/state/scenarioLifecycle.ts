import type { SavedScenario } from '@/state/useLaunchState';

export function normalizeScenarioName(name: string): string {
  return name.trim().slice(0, 80) || 'Untitled scenario';
}

export function renameSavedScenarios(
  scenarios: readonly SavedScenario[],
  id: string,
  name: string,
): SavedScenario[] {
  const safeName = normalizeScenarioName(name);
  return scenarios.map((scenario) => (scenario.id === id ? { ...scenario, name: safeName } : scenario));
}

export function duplicateSavedScenario(scenario: SavedScenario, id: string, savedAt: string): SavedScenario {
  return {
    ...scenario,
    comparisonIds: [...scenario.comparisonIds],
    id,
    name: normalizeScenarioName(`${scenario.name} copy`),
    pastedFields: [...scenario.pastedFields],
    savedAt,
    workload: { ...scenario.workload },
  };
}
