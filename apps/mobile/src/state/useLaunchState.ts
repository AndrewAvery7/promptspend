import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
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

import { SUGGESTED_CACHE_SHARE, type Catalog } from '@promptspend/core';

import { loadMobileCatalog, MOBILE_CATALOG_MAX_AGE_MS, type MobileCatalogResult } from '@/data/catalog';
import { defaultComparisonSelection } from '@/lib/comparison';
import { createDefaultPromptInputs, type PromptFieldKey, type PromptInputState } from '@/lib/promptInput';
import { createPersistedLaunchState, parsePersistedLaunchState } from '@/state/launchPersistence';
import {
  duplicateSavedScenario,
  normalizeScenarioName,
  renameSavedScenarios,
} from '@/state/scenarioLifecycle';

export const STORAGE_KEY = 'promptspend:launch:v1';
export const QUARANTINE_STORAGE_KEY = 'promptspend:launch:quarantine:v1';
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

export interface SavedScenario {
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  comparisonIds: string[];
  id: string;
  name: string;
  pastedFields: PromptFieldKey[];
  reasoningMultiplier: number;
  savedAt: string;
  selectedId: string;
  workload: WorkloadState;
}

interface LaunchStateValue {
  applyPreset: (preset: ScenarioPreset) => void;
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  catalogError: string | null;
  catalogResult: MobileCatalogResult | null;
  comparisonIds: string[];
  completeOnboarding: () => void;
  clearRestoredPasteNotice: () => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (scenario: SavedScenario) => SavedScenario;
  favorites: string[];
  hydrated: boolean;
  onboardingComplete: boolean;
  persistenceNotice: string | null;
  promptInputs: PromptInputState;
  reasoningMultiplier: number;
  restoredPasteFields: PromptFieldKey[];
  refreshing: boolean;
  refreshCatalog: () => Promise<void>;
  recoverScenario: (scenario: SavedScenario) => void;
  renameScenario: (id: string, name: string) => void;
  resetOnboarding: () => void;
  resetScenario: () => void;
  restoreScenario: (scenario: SavedScenario) => void;
  savedScenarios: SavedScenario[];
  saveScenario: (name: string, workloadOverride?: WorkloadState) => SavedScenario;
  selectedId: string;
  setBatchEnabled: Dispatch<SetStateAction<boolean>>;
  setCacheEnabled: Dispatch<SetStateAction<boolean>>;
  setCacheSharePercent: Dispatch<SetStateAction<number>>;
  setComparisonIds: Dispatch<SetStateAction<string[]>>;
  setPromptInputs: Dispatch<SetStateAction<PromptInputState>>;
  setReasoningMultiplier: Dispatch<SetStateAction<number>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setWorkload: Dispatch<SetStateAction<WorkloadState>>;
  toggleFavorite: (id: string) => void;
  setModelsWatched: (ids: readonly string[], watched: boolean) => void;
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
  const suppressPersistence = useRef(false);

  const acceptCatalog = useCallback((result: MobileCatalogResult) => {
    setCatalogResult(result);
    setSelectedId((current) => resolveSelectedModelId(result.catalog, current));
    setComparisonIds((current) => reconcileComparisonSelection(result.catalog, current));
    setCatalogError(null);
  }, []);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      acceptCatalog(await loadMobileCatalog());
    } catch (error) {
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
      setRefreshing(false);
    }
  }, [acceptCatalog, catalogResult]);

  useEffect(() => {
    let active = true;
    void loadMobileCatalog()
      .then((result) => {
        if (active) acceptCatalog(result);
      })
      .catch((error: unknown) => {
        if (active) {
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
        void refreshCatalog();
      }
    });
    return () => subscription.remove();
  }, [catalogResult, refreshCatalog]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed: unknown = JSON.parse(stored);
        const safe = parsePersistedLaunchState(parsed);
        if (!safe) {
          suppressPersistence.current = true;
          setPersistenceNotice(
            'Saved scenarios could not be read on this device. A recovery copy was preserved and the original data was not overwritten.',
          );
          return AsyncStorage.setItem(QUARANTINE_STORAGE_KEY, stored);
        }
        setFavorites(safe.favorites);
        setSavedScenarios(safe.savedScenarios);
        setOnboardingComplete(safe.onboardingComplete);
      })
      .catch(async () => {
        if (!active) return;
        suppressPersistence.current = true;
        setPersistenceNotice(
          'Saved scenarios could not be read on this device. A recovery copy was preserved and the original data was not overwritten.',
        );
        const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (stored) await AsyncStorage.setItem(QUARANTINE_STORAGE_KEY, stored).catch(() => undefined);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || suppressPersistence.current) return;
    const persisted = createPersistedLaunchState({
      favorites,
      onboardingComplete,
      savedScenarios,
    });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {
      // Storage failure is surfaced by the next save interaction, not startup.
    });
  }, [favorites, hydrated, onboardingComplete, savedScenarios]);

  const resetScenario = useCallback(() => {
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
    setWorkload({ ...preset.workload });
    setPromptInputs(createDefaultPromptInputs());
    setCacheEnabled(false);
    setCacheSharePercent(SUGGESTED_CACHE_SHARE * 100);
    setReasoningMultiplier(1);
    setBatchEnabled(false);
    setRestoredPasteFields([]);
  }, []);

  const saveScenario = useCallback(
    (name: string, workloadOverride = workload) => {
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
      setSavedScenarios((current) => [scenario, ...current].slice(0, 50));
      return scenario;
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
    ],
  );

  const restoreScenario = useCallback(
    (scenario: SavedScenario) => {
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

  const duplicateScenario = useCallback((scenario: SavedScenario) => {
    const duplicate = duplicateSavedScenario(
      scenario,
      `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      new Date().toISOString(),
    );
    setSavedScenarios((current) => [duplicate, ...current].slice(0, 50));
    return duplicate;
  }, []);

  const value = useMemo<LaunchStateValue>(
    () => ({
      applyPreset,
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      catalogError,
      catalogResult,
      comparisonIds,
      clearRestoredPasteNotice: () => setRestoredPasteFields([]),
      completeOnboarding: () => setOnboardingComplete(true),
      deleteScenario: (id) => setSavedScenarios((current) => current.filter((item) => item.id !== id)),
      duplicateScenario,
      favorites,
      hydrated,
      onboardingComplete,
      persistenceNotice,
      promptInputs,
      recoverScenario: (scenario) =>
        setSavedScenarios((current) =>
          [scenario, ...current.filter((item) => item.id !== scenario.id)].slice(0, 50),
        ),
      renameScenario: (id, name) => {
        setSavedScenarios((current) => renameSavedScenarios(current, id, name));
      },
      reasoningMultiplier,
      restoredPasteFields,
      refreshing,
      refreshCatalog,
      resetOnboarding: () => setOnboardingComplete(false),
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
        setFavorites((current) =>
          current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
        ),
      setModelsWatched: (ids, watched) =>
        setFavorites((current) => {
          const targets = new Set(ids);
          if (watched) return [...new Set([...current, ...ids])].slice(0, 100);
          return current.filter((id) => !targets.has(id));
        }),
      workload,
    }),
    [
      applyPreset,
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

  return createElement(LaunchStateContext.Provider, { value }, children);
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
  const age = now.getTime() - result.refreshedAt.getTime();
  return age >= 0 && age < MOBILE_CATALOG_MAX_AGE_MS;
}
