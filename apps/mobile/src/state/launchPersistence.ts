import type { ActiveDraft, SavedScenario } from '@/state/useLaunchState';

export interface PersistedLaunchState {
  activeDraft: ActiveDraft | null;
  favorites: string[];
  onboardingComplete: boolean;
  savedScenarios: SavedScenario[];
  version: 3;
}

interface PersistedLaunchStateInput {
  activeDraft?: ActiveDraft | null;
  favorites: readonly string[];
  onboardingComplete: boolean;
  savedScenarios: readonly SavedScenario[];
}

export function createPersistedLaunchState({
  activeDraft = null,
  favorites,
  onboardingComplete,
  savedScenarios,
}: PersistedLaunchStateInput): PersistedLaunchState {
  return {
    activeDraft: activeDraft ? parseActiveDraft(activeDraft) : null,
    favorites: [...favorites].slice(0, 100),
    onboardingComplete,
    savedScenarios: savedScenarios
      .map(parseSavedScenario)
      .filter((scenario): scenario is SavedScenario => scenario !== null)
      .slice(0, 50),
    version: 3,
  };
}

export function parsePersistedLaunchState(value: unknown): PersistedLaunchState | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3)) {
    return null;
  }
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
    activeDraft: value.version === 3 ? parseActiveDraft(value.activeDraft) : null,
    favorites,
    onboardingComplete: value.onboardingComplete === true,
    savedScenarios,
    version: 3,
  };
}

function parseSavedScenario(value: unknown): SavedScenario | null {
  if (!isRecord(value)) return null;
  const activeDraft = parseActiveDraft(value);
  if (!activeDraft) return null;
  const valid =
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (typeof value.savedAt === 'string' || value.savedAt === null || value.savedAt === undefined);
  if (!valid) return null;
  return {
    ...activeDraft,
    id: value.id as string,
    name: value.name as string,
    savedAt:
      typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) ? value.savedAt : '',
  };
}

function parseActiveDraft(value: unknown): ActiveDraft | null {
  if (!isRecord(value) || !isWorkload(value.workload)) return null;
  const valid =
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
        (field): field is ActiveDraft['pastedFields'][number] =>
          field === 'system' || field === 'user' || field === 'output',
      )
    : [];
  const workload = value.workload as ActiveDraft['workload'];
  return {
    batchEnabled: value.batchEnabled as boolean,
    cacheEnabled: value.cacheEnabled as boolean,
    cacheSharePercent: value.cacheSharePercent as number,
    comparisonIds: [...new Set(value.comparisonIds as string[])].slice(0, 4),
    pastedFields: [...new Set(pastedFields)],
    reasoningMultiplier: value.reasoningMultiplier as number,
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
