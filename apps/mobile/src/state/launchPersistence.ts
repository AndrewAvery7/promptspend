import type { SavedScenario } from '@/state/useLaunchState';

export interface PersistedLaunchState {
  favorites: string[];
  onboardingComplete: boolean;
  savedScenarios: SavedScenario[];
  version: 1;
}

interface PersistedLaunchStateInput {
  favorites: readonly string[];
  onboardingComplete: boolean;
  savedScenarios: readonly SavedScenario[];
}

export function createPersistedLaunchState({
  favorites,
  onboardingComplete,
  savedScenarios,
}: PersistedLaunchStateInput): PersistedLaunchState {
  return {
    favorites: [...favorites].slice(0, 100),
    onboardingComplete,
    savedScenarios: [...savedScenarios].slice(0, 50),
    version: 1,
  };
}

export function parsePersistedLaunchState(value: unknown): PersistedLaunchState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.filter((id): id is string => typeof id === 'string').slice(0, 100)
    : [];
  const savedScenarios = Array.isArray(value.savedScenarios)
    ? value.savedScenarios.filter(isSavedScenario).slice(0, 50)
    : [];
  return {
    favorites,
    onboardingComplete: value.onboardingComplete === true,
    savedScenarios,
    version: 1,
  };
}

function isSavedScenario(value: unknown): value is SavedScenario {
  if (!isRecord(value) || !isWorkload(value.workload)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.savedAt === 'string' &&
    typeof value.selectedId === 'string' &&
    Array.isArray(value.comparisonIds) &&
    value.comparisonIds.every((id) => typeof id === 'string') &&
    typeof value.batchEnabled === 'boolean' &&
    typeof value.cacheEnabled === 'boolean' &&
    typeof value.cacheSharePercent === 'number' &&
    Number.isFinite(value.cacheSharePercent) &&
    typeof value.reasoningMultiplier === 'number' &&
    Number.isFinite(value.reasoningMultiplier)
  );
}

function isWorkload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    value.conversationsPerDay,
    value.monthlyActiveUsers,
    value.outputTokens,
    value.revenuePerUserPerMonth,
    value.systemTokens,
    value.turns,
    value.userTokens,
  ].every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
