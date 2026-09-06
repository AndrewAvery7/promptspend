import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { SUGGESTED_CACHE_SHARE, type Catalog, type Scenario as SharedScenario } from '@promptspend/core';

import {
  loadMobileCatalog,
  isMobileCatalogFresh,
  MOBILE_CATALOG_MAX_AGE_MS,
  type MobileCatalogResult,
} from '@/data/catalog';
import { defaultComparisonSelection } from '@/lib/comparison';
import { createDefaultPromptInputs, type PromptFieldKey, type PromptInputState } from '@/lib/promptInput';
import { type PersistedLaunchState } from '@/state/launchPersistence';
import { DurableLaunchStore } from '@/state/durableLaunchStore';
import { assertNumericDraftsValid, discardNumericDrafts } from '@/lib/numericDrafts';
import {
  duplicateSavedScenario,
  normalizeScenarioName,
  renameSavedScenarios,
} from '@/state/scenarioLifecycle';

export { STORAGE_KEY, QUARANTINE_STORAGE_KEY } from '@/state/durableLaunchStore';
export const DEFAULT_MODEL_ID = 'claude-sonnet-5';

export interface WorkloadState {
  conversationsPerDay: number;
  monthlyActiveUsers: number;
  outputTokens: number;
  revenuePerUserPerMonth: number;
  systemTokens: number;
  turns: number;
  userTokens: number;
}

export const DEFAULT_WORKLOAD: WorkloadState = {
  conversationsPerDay: 2500,
  monthlyActiveUsers: 1000,
  outputTokens: 900,
  revenuePerUserPerMonth: 0,
  systemTokens: 800,
  turns: 6,
  userTokens: 400,
};

export interface ScenarioPreset {
  description: string;
  id: string;
  label: string;
  workload: WorkloadState;
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: 'support',
    label: 'Customer support',
    description: 'A multi-turn assistant handling product and account questions.',
    workload: {
      conversationsPerDay: 2500,
      monthlyActiveUsers: 1000,
      outputTokens: 700,
      revenuePerUserPerMonth: 0,
      systemTokens: 1200,
      turns: 6,
      userTokens: 280,
    },
  },
  {
    id: 'documents',
    label: 'Document analysis',
    description: 'Long source material with a focused structured response.',
    workload: {
      conversationsPerDay: 350,
      monthlyActiveUsers: 200,
      outputTokens: 1200,
      revenuePerUserPerMonth: 0,
      systemTokens: 900,
      turns: 1,
      userTokens: 18000,
    },
  },
  {
    id: 'coding',
    label: 'Coding assistant',
    description: 'Repository context, iterative questions, and detailed code output.',
    workload: {
      conversationsPerDay: 900,
      monthlyActiveUsers: 300,
      outputTokens: 1800,
      revenuePerUserPerMonth: 20,
      systemTokens: 1600,
      turns: 5,
      userTokens: 1400,
    },
  },
  {
    id: 'content',
    label: 'Content generation',
    description: 'A concise brief that produces a longer drafted response.',
    workload: {
      conversationsPerDay: 500,
      monthlyActiveUsers: 250,
      outputTokens: 2200,
      revenuePerUserPerMonth: 15,
      systemTokens: 700,
      turns: 1,
      userTokens: 600,
    },
  },
  {
    id: 'classification',
    label: 'High-volume classification',
    description: 'Small inputs and outputs repeated at operational scale.',
    workload: {
      conversationsPerDay: 100000,
      monthlyActiveUsers: 10000,
      outputTokens: 16,
      revenuePerUserPerMonth: 0,
      systemTokens: 220,
      turns: 1,
      userTokens: 180,
    },
  },
] as const;

export interface ActiveDraft {
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  comparisonIds: string[];
  pastedFields: PromptFieldKey[];
  reasoningMultiplier: number;
  selectedId: string;
  workload: WorkloadState;
}

export interface SavedScenario extends ActiveDraft {
  id: string;
  name: string;
  savedAt: string;
}

interface LaunchStateValue {
  applySharedScenario: (scenario: SharedScenario) => void;
  applyPreset: (preset: ScenarioPreset) => void;
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  catalogError: string | null;
  catalogResult: MobileCatalogResult | null;
  comparisonIds: string[];
  completeOnboarding: () => Promise<boolean>;
  clearRestoredPasteNotice: () => void;
  deleteScenario: (id: string) => Promise<boolean>;
  duplicateScenario: (scenario: SavedScenario) => Promise<SavedScenario | null>;
  favorites: string[];
  hydrated: boolean;
  onboardingComplete: boolean;
  persistenceNotice: string | null;
  persistenceBlocked: boolean;
  persistenceBusy: boolean;
  retryPersistence: () => Promise<void>;
  recoverPersistence: () => Promise<void>;
  assertCurrentPricing: () => void;
  pricingDay: string;
  promptInputs: PromptInputState;
  reasoningMultiplier: number;
  restoredPasteFields: PromptFieldKey[];
  refreshing: boolean;
  refreshCatalog: () => Promise<void>;
  recoverScenario: (scenario: SavedScenario) => Promise<boolean>;
  renameScenario: (id: string, name: string) => Promise<boolean>;
  resetOnboarding: () => Promise<boolean>;
  resetScenario: () => void;
  restoreScenario: (scenario: SavedScenario) => void;
  savedScenarios: SavedScenario[];
  saveScenario: (name: string, workloadOverride?: WorkloadState) => Promise<SavedScenario | null>;
  selectedId: string;
  setBatchEnabled: Dispatch<SetStateAction<boolean>>;
  setCacheEnabled: Dispatch<SetStateAction<boolean>>;
  setCacheSharePercent: Dispatch<SetStateAction<number>>;
  setComparisonIds: Dispatch<SetStateAction<string[]>>;
  setPromptInputs: Dispatch<SetStateAction<PromptInputState>>;
  setReasoningMultiplier: Dispatch<SetStateAction<number>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setWorkload: Dispatch<SetStateAction<WorkloadState>>;
  toggleFavorite: (id: string) => Promise<boolean>;
  setModelsWatched: (ids: readonly string[], watched: boolean) => Promise<boolean>;
  workload: WorkloadState;
}

const LaunchStateContext = createContext<LaunchStateValue | null>(null);

export function LaunchStateProvider({ children }: PropsWithChildren) {
  const [catalogResult, setCatalogResult] = useState<MobileCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(DEFAULT_MODEL_ID);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [workload, setWorkload] = useState(DEFAULT_WORKLOAD);
  const [promptInputs, setPromptInputs] = useState(createDefaultPromptInputs);
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheSharePercent, setCacheSharePercent] = useState(SUGGESTED_CACHE_SHARE * 100);
  const [reasoningMultiplier, setReasoningMultiplier] = useState(1);
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restoredPasteFields, setRestoredPasteFields] = useState<PromptFieldKey[]>([]);
  const appState = useRef(AppState.currentState);
  const [store] = useState(() => new DurableLaunchStore(AsyncStorage));
  const [persistenceBlocked, setPersistenceBlocked] = useState(false);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const pendingWrites = useRef(0);
  const savingScenario = useRef(false);
  const refreshSequence = useRef(0);
  const [clock, setClock] = useState(() => Date.now());
  const pricingDay = new Date(clock).toISOString().slice(0, 10);

  const restoreActiveDraft = useCallback((draft: ActiveDraft | null) => {
    if (!draft) return;
    discardNumericDrafts();
    setSelectedId(draft.selectedId);
    setComparisonIds([...draft.comparisonIds]);
    setWorkload({ ...draft.workload });
    setPromptInputs(createDefaultPromptInputs());
    setCacheEnabled(draft.cacheEnabled);
    setCacheSharePercent(draft.cacheSharePercent);
    setReasoningMultiplier(draft.reasoningMultiplier);
    setBatchEnabled(draft.batchEnabled);
    setRestoredPasteFields([...draft.pastedFields]);
  }, []);

  const publishPersistedState = useCallback((state: PersistedLaunchState) => {
    setFavorites(state.favorites);
    setSavedScenarios(state.savedScenarios);
    setOnboardingComplete(state.onboardingComplete);
  }, []);

  const retryPersistence = useCallback(async () => {
    if (pendingWrites.current > 0) return;
    pendingWrites.current += 1;
    setHydrated(false);
    try {
      const result = await store.load();
      publishPersistedState(result.state);
      restoreActiveDraft(result.state.activeDraft);
      setPersistenceNotice(result.notice);
      setPersistenceBlocked(result.blocked);
    } catch (error) {
      setPersistenceNotice(
        error instanceof Error ? error.message : 'Reading saved data failed. Please retry.',
      );
    } finally {
      pendingWrites.current -= 1;
      setHydrated(true);
    }
  }, [publishPersistedState, restoreActiveDraft, store]);

  const persist = useCallback(
    async (change: (state: PersistedLaunchState) => PersistedLaunchState) => {
      pendingWrites.current += 1;
      setPersistenceBusy(true);
      try {
        publishPersistedState(await store.mutate(change));
        setPersistenceNotice(null);
        return true;
      } catch (error) {
        setPersistenceNotice(
          error instanceof Error
            ? `Not saved: ${error.message}`
            : 'Not saved. Device storage is unavailable; please retry.',
        );
        return false;
      } finally {
        pendingWrites.current -= 1;
        setPersistenceBusy(pendingWrites.current > 0);
      }
    },
    [publishPersistedState, store],
  );

  const recoverPersistence = useCallback(async () => {
    if (pendingWrites.current > 0) return;
    pendingWrites.current += 1;
    setPersistenceBusy(true);
    try {
      publishPersistedState(await store.startSeparateArea());
      setPersistenceBlocked(false);
      setPersistenceNotice(
        'A separate save area is ready. Previous unreadable data remains preserved; new saves will not overwrite it.',
      );
    } catch {
      setPersistenceNotice(
        'Recovery could not be completed. No saved data was replaced. Free device storage and retry.',
      );
    } finally {
      pendingWrites.current -= 1;
      setPersistenceBusy(false);
    }
  }, [publishPersistedState, store]);

  const assertCurrentPricing = useCallback(() => {
    if (!catalogResult || !isCatalogResultUsable(catalogResult)) {
      throw new Error(
        'Current prices are unavailable or expired. Refresh pricing before saving or sharing an estimate.',
      );
    }
    if (new Date().toISOString().slice(0, 10) !== pricingDay) {
      setClock(Date.now());
      throw new Error('The pricing date has changed. Please tap again after the estimate updates.');
    }
  }, [catalogResult, pricingDay]);

  const acceptCatalog = useCallback((result: MobileCatalogResult) => {
    setClock(Date.now());
    setCatalogResult(result);
    setSelectedId((current) => resolveSelectedModelId(result.catalog, current));
    setComparisonIds((current) => reconcileComparisonSelection(result.catalog, current));
    setCatalogError(null);
  }, []);

  const refreshCatalog = useCallback(async () => {
    const request = ++refreshSequence.current;
    setRefreshing(true);
    try {
      const result = await loadMobileCatalog();
      if (request === refreshSequence.current) acceptCatalog(result);
    } catch (error) {
      if (request !== refreshSequence.current) return;
      const message = error instanceof Error ? error.message : 'Current pricing is unavailable.';
      if (catalogResult && isCatalogResultUsable(catalogResult)) {
        setCatalogResult({
          ...catalogResult,
          warning: 'Live prices could not be refreshed. Showing the last validated download.',
        });
        setCatalogError(null);
      } else {
        setCatalogResult(null);
        setCatalogError(message);
      }
    } finally {
      if (request === refreshSequence.current) setRefreshing(false);
    }
  }, [acceptCatalog, catalogResult]);

  useEffect(() => {
    // Wake at expiry (not only foreground), and at UTC midnight for date-sensitive pricing.
    const now = Date.now();
    const expiresAt = catalogResult
      ? catalogResult.refreshedAt.getTime() + MOBILE_CATALOG_MAX_AGE_MS
      : Infinity;
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const timeout = setTimeout(
      () => {
        setClock(Date.now());
        if (catalogResult && !isCatalogResultUsable(catalogResult)) {
          setCatalogResult(null);
          setCatalogError('The last validated prices have expired. Refresh to show current estimates.');
        }
      },
      Math.max(1, Math.min(expiresAt - now, midnight.getTime() - now, 60_000)),
    );
    return () => clearTimeout(timeout);
  }, [catalogResult, clock]);

  useEffect(() => {
    let active = true;
    const request = ++refreshSequence.current;
    void loadMobileCatalog()
      .then((result) => {
        if (active && request === refreshSequence.current) acceptCatalog(result);
      })
      .catch((error: unknown) => {
        if (active && request === refreshSequence.current) {
          setCatalogError(error instanceof Error ? error.message : 'Current pricing is unavailable.');
        }
      });
    return () => {
      active = false;
    };
  }, [acceptCatalog]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returningToForeground =
        (appState.current === 'background' || appState.current === 'inactive') && nextState === 'active';
      appState.current = nextState;
      if (returningToForeground && (!catalogResult || !isCatalogResultUsable(catalogResult))) {
        setCatalogResult(null);
        setCatalogError('Checking current prices after returning to the app.');
        void refreshCatalog();
      }
      if (returningToForeground) setClock(Date.now());
    });
    return () => subscription.remove();
  }, [catalogResult, refreshCatalog]);

  useEffect(() => {
    let active = true;
    void store
      .load()
      .then((result) => {
        if (!active) return;
        publishPersistedState(result.state);
        restoreActiveDraft(result.state.activeDraft);
        setPersistenceNotice(result.notice);
        setPersistenceBlocked(result.blocked);
        setHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        setPersistenceBlocked(true);
        setPersistenceNotice(
          'Saved data could not be loaded. The original was not overwritten. Retry storage to continue.',
        );
        setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [publishPersistedState, restoreActiveDraft, store]);

  const activeDraft = useMemo<ActiveDraft>(
    () => ({
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      comparisonIds: [...comparisonIds],
      pastedFields: (Object.keys(promptInputs) as PromptFieldKey[]).filter(
        (field) => promptInputs[field].mode === 'text',
      ),
      reasoningMultiplier,
      selectedId,
      workload: { ...workload },
    }),
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      comparisonIds,
      promptInputs,
      reasoningMultiplier,
      selectedId,
      workload,
    ],
  );

  useEffect(() => {
    if (!hydrated || persistenceBlocked) return;
    const timer = setTimeout(() => {
      pendingWrites.current += 1;
      void store
        .mutate((state) => ({ ...state, activeDraft }))
        .then(() => {
          setPersistenceNotice((current) =>
            current?.startsWith('Working draft not saved:') ? null : current,
          );
        })
        .catch((error: unknown) => {
          setPersistenceNotice(
            `Working draft not saved: ${error instanceof Error ? error.message : 'device storage is unavailable.'}`,
          );
        })
        .finally(() => {
          pendingWrites.current -= 1;
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [activeDraft, hydrated, persistenceBlocked, store]);

  const applySharedScenario = useCallback((scenario: SharedScenario) => {
    discardNumericDrafts();
    setSelectedId(scenario.modelIds[0] ?? DEFAULT_MODEL_ID);
    setComparisonIds([...scenario.modelIds].slice(0, 4));
    setWorkload({
      conversationsPerDay: scenario.conversationsPerDay,
      monthlyActiveUsers: scenario.monthlyActiveUsers,
      outputTokens: scenario.outputTokens,
      revenuePerUserPerMonth: scenario.revenuePerUserPerMonth,
      systemTokens: scenario.systemTokens,
      turns: scenario.turns,
      userTokens: scenario.userTokens,
    });
    setPromptInputs(createDefaultPromptInputs());
    setCacheEnabled(scenario.cachedInputShare > 0);
    setCacheSharePercent(scenario.cachedInputShare * 100);
    setReasoningMultiplier(Math.min(5, scenario.reasoningMultiplier));
    setBatchEnabled(scenario.useBatchApi);
    setRestoredPasteFields([...scenario.pastedFields]);
  }, []);

  const resetScenario = useCallback(() => {
    discardNumericDrafts();
    setSelectedId(DEFAULT_MODEL_ID);
    setComparisonIds((current) => {
      const catalog = catalogResult?.catalog;
      return catalog ? defaultComparisonSelection(catalog.primaryModels) : current;
    });
    setWorkload(DEFAULT_WORKLOAD);
    setPromptInputs(createDefaultPromptInputs());
    setCacheEnabled(false);
    setCacheSharePercent(SUGGESTED_CACHE_SHARE * 100);
    setReasoningMultiplier(1);
    setBatchEnabled(false);
    setRestoredPasteFields([]);
  }, [catalogResult]);

  const applyPreset = useCallback((preset: ScenarioPreset) => {
    discardNumericDrafts();
    setWorkload({ ...preset.workload });
    setPromptInputs(createDefaultPromptInputs());
    setCacheEnabled(false);
    setCacheSharePercent(SUGGESTED_CACHE_SHARE * 100);
    setReasoningMultiplier(1);
    setBatchEnabled(false);
    setRestoredPasteFields([]);
  }, []);

  const saveScenario = useCallback(
    async (name: string, workloadOverride = workload) => {
      if (savingScenario.current) return null;
      savingScenario.current = true;
      try {
        assertNumericDraftsValid();
        assertCurrentPricing();
        const scenario: SavedScenario = {
          batchEnabled,
          cacheEnabled,
          cacheSharePercent,
          comparisonIds: [...comparisonIds],
          id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: normalizeScenarioName(name),
          pastedFields: (Object.keys(promptInputs) as PromptFieldKey[]).filter(
            (field) => promptInputs[field].mode === 'text',
          ),
          reasoningMultiplier,
          savedAt: new Date().toISOString(),
          selectedId,
          workload: { ...workloadOverride },
        };
        const saved = await persist((state) => ({
          ...state,
          savedScenarios: [scenario, ...state.savedScenarios].slice(0, 50),
        }));
        return saved ? scenario : null;
      } catch (error) {
        setPersistenceNotice(error instanceof Error ? error.message : 'This scenario could not be saved.');
        return null;
      } finally {
        savingScenario.current = false;
      }
    },
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      comparisonIds,
      promptInputs,
      reasoningMultiplier,
      selectedId,
      workload,
      assertCurrentPricing,
      persist,
    ],
  );

  const restoreScenario = useCallback(
    (scenario: SavedScenario) => {
      discardNumericDrafts();
      const catalog = catalogResult?.catalog;
      setSelectedId(catalog ? resolveSelectedModelId(catalog, scenario.selectedId) : scenario.selectedId);
      setComparisonIds(
        catalog ? reconcileComparisonSelection(catalog, scenario.comparisonIds) : [...scenario.comparisonIds],
      );
      setWorkload({ ...scenario.workload });
      setPromptInputs(createDefaultPromptInputs());
      setCacheEnabled(scenario.cacheEnabled);
      setCacheSharePercent(scenario.cacheSharePercent);
      setReasoningMultiplier(scenario.reasoningMultiplier);
      setBatchEnabled(scenario.batchEnabled);
      setRestoredPasteFields([...scenario.pastedFields]);
    },
    [catalogResult],
  );

  const duplicateScenario = useCallback(
    async (scenario: SavedScenario) => {
      const duplicate = duplicateSavedScenario(
        scenario,
        `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        new Date().toISOString(),
      );
      const saved = await persist((state) => ({
        ...state,
        savedScenarios: [duplicate, ...state.savedScenarios].slice(0, 50),
      }));
      return saved ? duplicate : null;
    },
    [persist],
  );

  const value = useMemo<LaunchStateValue>(
    () => ({
      applySharedScenario,
      applyPreset,
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      catalogError,
      catalogResult:
        catalogResult && isCatalogResultUsable(catalogResult, new Date(clock)) ? catalogResult : null,
      comparisonIds,
      clearRestoredPasteNotice: () => setRestoredPasteFields([]),
      completeOnboarding: () => persist((state) => ({ ...state, onboardingComplete: true })),
      deleteScenario: (id) =>
        persist((state) => ({
          ...state,
          savedScenarios: state.savedScenarios.filter((item) => item.id !== id),
        })),
      duplicateScenario,
      favorites,
      hydrated,
      onboardingComplete,
      persistenceNotice,
      persistenceBlocked,
      persistenceBusy,
      retryPersistence,
      recoverPersistence,
      assertCurrentPricing,
      pricingDay,
      promptInputs,
      recoverScenario: (scenario) =>
        persist((state) => ({
          ...state,
          savedScenarios: [scenario, ...state.savedScenarios.filter((item) => item.id !== scenario.id)].slice(
            0,
            50,
          ),
        })),
      renameScenario: (id, name) =>
        persist((state) => ({
          ...state,
          savedScenarios: renameSavedScenarios(state.savedScenarios, id, name),
        })),
      reasoningMultiplier,
      restoredPasteFields,
      refreshing,
      refreshCatalog,
      resetOnboarding: () => persist((state) => ({ ...state, onboardingComplete: false })),
      resetScenario,
      restoreScenario,
      savedScenarios,
      saveScenario,
      selectedId,
      setBatchEnabled,
      setCacheEnabled,
      setCacheSharePercent,
      setComparisonIds,
      setPromptInputs,
      setReasoningMultiplier,
      setSelectedId,
      setWorkload,
      toggleFavorite: (id) =>
        persist((state) => ({
          ...state,
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((item) => item !== id)
            : [...state.favorites, id].slice(0, 100),
        })),
      setModelsWatched: (ids, watched) =>
        persist((state) => {
          const targets = new Set(ids);
          return {
            ...state,
            favorites: watched
              ? [...new Set([...state.favorites, ...ids])].slice(0, 100)
              : state.favorites.filter((id) => !targets.has(id)),
          };
        }),
      workload,
    }),
    [
      applyPreset,
      applySharedScenario,
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      catalogError,
      catalogResult,
      comparisonIds,
      duplicateScenario,
      favorites,
      hydrated,
      onboardingComplete,
      persistenceNotice,
      persistenceBlocked,
      persistenceBusy,
      retryPersistence,
      recoverPersistence,
      assertCurrentPricing,
      pricingDay,
      persist,
      clock,
      promptInputs,
      reasoningMultiplier,
      restoredPasteFields,
      refreshing,
      refreshCatalog,
      resetScenario,
      restoreScenario,
      savedScenarios,
      saveScenario,
      selectedId,
      workload,
    ],
  );

  return <LaunchStateContext.Provider value={value}>{children}</LaunchStateContext.Provider>;
}

export function useLaunchState(): LaunchStateValue {
  const value = useContext(LaunchStateContext);
  if (!value) throw new Error('useLaunchState must be used within LaunchStateProvider.');
  return value;
}

export function reconcileComparisonSelection(catalog: Catalog, selectedIds: readonly string[]): string[] {
  const valid = [...new Set(selectedIds)].filter((id) => catalog.get(id) !== undefined).slice(0, 4);
  if (valid.length > 0) return valid;
  return defaultComparisonSelection(catalog.primaryModels);
}

export function resolveSelectedModelId(catalog: Catalog, selectedId: string): string {
  if (catalog.get(selectedId)) return selectedId;
  if (catalog.get(DEFAULT_MODEL_ID)) return DEFAULT_MODEL_ID;
  return catalog.primaryModels[0]?.id ?? '';
}

export function isCatalogResultUsable(result: MobileCatalogResult, now = new Date()): boolean {
  return isMobileCatalogFresh(result.refreshedAt, now);
}
