import type { SavedScenario } from '@/state/useLaunchState';

export interface PersistedLaunchState {
  favorites: string[];
  onboardingComplete: boolean;
  savedScenarios: SavedScenario[];
  version: 2;
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
    version: 2,
  };
}

export function parsePersistedLaunchState(value: unknown): PersistedLaunchState | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return null;
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.filter((id): id is string => typeof id === 'string').slice(0, 100)
    : [];
  const savedScenarios = Array.isArray(value.savedScenarios)
    ? value.savedScenarios
        .map(parseSavedScenario)
        .filter((scenario): scenario is SavedScenario => scenario !== null)
        .slice(0, 50)
    : [];
  return {
    favorites,
    onboardingComplete: value.onboardingComplete === true,
    savedScenarios,
    version: 2,
  };
}

function parseSavedScenario(value: unknown): SavedScenario | null {
  if (!isRecord(value) || !isWorkload(value.workload)) return null;
  const valid =
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
    value.cacheSharePercent >= 0 &&
    value.cacheSharePercent <= 100 &&
    typeof value.reasoningMultiplier === 'number' &&
    Number.isFinite(value.reasoningMultiplier) &&
    value.reasoningMultiplier >= 1 &&
    value.reasoningMultiplier <= 5;
  if (!valid) return null;
  const pastedFields = Array.isArray(value.pastedFields)
    ? value.pastedFields.filter(
        (field): field is SavedScenario['pastedFields'][number] =>
          field === 'system' || field === 'user' || field === 'output',
      )
    : [];
  const workload = value.workload as SavedScenario['workload'];
  return {
    batchEnabled: value.batchEnabled as boolean,
    cacheEnabled: value.cacheEnabled as boolean,
    cacheSharePercent: value.cacheSharePercent as number,
    comparisonIds: [...(value.comparisonIds as string[])],
    id: value.id as string,
    name: value.name as string,
    pastedFields: [...new Set(pastedFields)],
    reasoningMultiplier: value.reasoningMultiplier as number,
    savedAt: value.savedAt as string,
    selectedId: value.selectedId as string,
    workload: {
      conversationsPerDay: workload.conversationsPerDay,
      monthlyActiveUsers: workload.monthlyActiveUsers,
      outputTokens: workload.outputTokens,
      revenuePerUserPerMonth: workload.revenuePerUserPerMonth,
      systemTokens: workload.systemTokens,
      turns: workload.turns,
      userTokens: workload.userTokens,
    },
  };
}

function isWorkload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isBoundedNumber(value.conversationsPerDay, 0, 100_000_000) &&
    isBoundedNumber(value.monthlyActiveUsers, 1, 1_000_000_000) &&
    isBoundedNumber(value.outputTokens, 0, 200_000) &&
    isBoundedNumber(value.revenuePerUserPerMonth, 0, 1_000_000) &&
    isBoundedNumber(value.systemTokens, 0, 200_000) &&
    isBoundedNumber(value.turns, 1, 200) &&
    isBoundedNumber(value.userTokens, 0, 200_000)
  );
}

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
