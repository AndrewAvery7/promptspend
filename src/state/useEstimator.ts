import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { compareModels, type ComparisonRow, type Workload } from '@/lib/engine/cost';
import { buildInsights } from '@/lib/engine/insights';
import { countTokens, estimateTokens } from '@/lib/tokenize';
import {
  DEFAULT_SCENARIO,
  MAX_MODELS,
  clampField,
  decodeScenario,
  encodeScenario,
  type Scenario,
} from '@/lib/url/scenario';

export type FieldKey = 'system' | 'user' | 'output';
export type InputMode = 'slider' | 'paste';

export interface FieldState {
  mode: InputMode;
  text: string;
}

/** Token counts for one model, plus how each was arrived at. */
export interface ModelTokens {
  system: number;
  user: number;
  output: number;
  method: 'exact' | 'estimate';
}

const FIELDS: FieldKey[] = ['system', 'user', 'output'];

/** Pick sensible starting models: a frontier one, a mid-tier one, two budget ones. */
export function defaultSelection(catalog: Catalog): string[] {
  const preferred = ['claude-sonnet-5', 'gpt-5.4', 'deepseek-deepseek-v3.2', 'moonshot-kimi-k2.5'];
  const found = preferred.filter((id) => catalog.get(id) !== undefined);
  if (found.length >= 2) return found.slice(0, MAX_MODELS);

  const sorted = [...catalog.models].sort((a, b) => a.pricing.output - b.pricing.output);
  const cheap = sorted.slice(0, 2).map((m) => m.id);
  const dear = sorted.slice(-2).map((m) => m.id);
  return [...new Set([...dear, ...cheap])].slice(0, MAX_MODELS);
}

export function useEstimator(catalog: Catalog) {
  const [scenario, setScenario] = useState<Scenario>(() => {
    const fromUrl = decodeScenario(window.location.search);
    const modelIds = fromUrl.modelIds.filter((id) => catalog.get(id) !== undefined);
    return { ...fromUrl, modelIds: modelIds.length > 0 ? modelIds : defaultSelection(catalog) };
  });

  const [fields, setFields] = useState<Record<FieldKey, FieldState>>({
    system: { mode: 'slider', text: '' },
    user: { mode: 'slider', text: '' },
    output: { mode: 'slider', text: '' },
  });

  /** Exact counts arrive asynchronously; keyed by `${modelId}|${field}|${text}`. */
  const [exactCounts, setExactCounts] = useState<Record<string, number>>({});

  const models = useMemo(() => catalog.getAll(scenario.modelIds), [catalog, scenario.modelIds]);

  // Keep the address bar in step so any estimate is shareable by copying the URL.
  useEffect(() => {
    const query = encodeScenario(scenario);
    const next = `${window.location.pathname}?${query}`;
    window.history.replaceState(null, '', next);
  }, [scenario]);

  // Real tokenizer counts for the models that have one we can run locally.
  useEffect(() => {
    let cancelled = false;
    const pending: Promise<void>[] = [];

    for (const model of models) {
      if (model.tokenizer.kind !== 'tiktoken') continue;
      for (const field of FIELDS) {
        const state = fields[field];
        if (state.mode !== 'paste' || state.text.length === 0) continue;
        const key = `${model.id}|${field}|${state.text}`;
        if (exactCounts[key] !== undefined) continue;
        pending.push(
          countTokens(state.text, model).then((result) => {
            if (cancelled || result.method !== 'exact') return;
            setExactCounts((prev) =>
              prev[key] === result.tokens ? prev : { ...prev, [key]: result.tokens },
            );
          }),
        );
      }
    }

    void Promise.all(pending);
    return () => {
      cancelled = true;
    };
  }, [models, fields, exactCounts]);

  const tokensForModel = useCallback(
    (model: Model): ModelTokens => {
      let method: ModelTokens['method'] = 'exact';
      const read = (field: FieldKey, sliderValue: number): number => {
        const state = fields[field];
        if (state.mode !== 'paste') return sliderValue;
        if (state.text.length === 0) return 0;
        const key = `${model.id}|${field}|${state.text}`;
        const exact = exactCounts[key];
        if (exact !== undefined) return exact;
        method = 'estimate';
        return estimateTokens(state.text, model.tokenizer);
      };
      return {
        system: read('system', scenario.systemTokens),
        user: read('user', scenario.userTokens),
        output: read('output', scenario.outputTokens),
        method,
      };
    },
    [fields, exactCounts, scenario.systemTokens, scenario.userTokens, scenario.outputTokens],
  );

  const rows: ComparisonRow[] = useMemo(() => {
    if (models.length === 0) return [];
    // Each model is costed against its *own* tokenizer's view of the text —
    // the same prompt really is a different number of tokens per family.
    const perModel = models.map((model) => {
      const tokens = tokensForModel(model);
      const workload: Workload = {
        systemTokens: tokens.system,
        userTokens: tokens.user,
        outputTokens: tokens.output,
        turns: scenario.turns,
      };
      return compareModels([model], workload, scenarioScale(scenario), {
        cachedInputShare: scenario.cachedInputShare,
        reasoningMultiplier: scenario.reasoningMultiplier,
        useBatchApi: scenario.useBatchApi,
      })[0]!;
    });

    perModel.sort((a, b) => a.scaled.perMonth - b.scaled.perMonth);
    const cheapest = perModel[0]!;
    return perModel.map((row, index) => ({
      ...row,
      deltaPerMonth: row.scaled.perMonth - cheapest.scaled.perMonth,
      multipleOfCheapest: cheapest.scaled.perMonth > 0 ? row.scaled.perMonth / cheapest.scaled.perMonth : 1,
      isCheapest: index === 0,
    }));
  }, [models, scenario, tokensForModel]);

  const insights = useMemo(
    () =>
      buildInsights(
        rows,
        {
          systemTokens: scenario.systemTokens,
          userTokens: scenario.userTokens,
          outputTokens: scenario.outputTokens,
          turns: scenario.turns,
        },
        scenario.revenuePerUserPerMonth,
      ),
    [rows, scenario],
  );

  const update = useCallback(<K extends keyof Scenario>(key: K, value: Scenario[K]) => {
    setScenario((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateNumber = useCallback(
    (
      key:
        | 'systemTokens'
        | 'userTokens'
        | 'outputTokens'
        | 'turns'
        | 'conversationsPerDay'
        | 'monthlyActiveUsers'
        | 'revenuePerUserPerMonth'
        | 'cachedInputShare',
      value: number,
    ) => {
      setScenario((prev) => ({ ...prev, [key]: clampField(key, value) }));
    },
    [],
  );

  const toggleModel = useCallback((id: string): { ok: boolean; reason?: string } => {
    let result: { ok: boolean; reason?: string } = { ok: true };
    setScenario((prev) => {
      if (prev.modelIds.includes(id)) {
        return { ...prev, modelIds: prev.modelIds.filter((existing) => existing !== id) };
      }
      if (prev.modelIds.length >= MAX_MODELS) {
        result = { ok: false, reason: `Compare up to ${MAX_MODELS} models at once` };
        return prev;
      }
      return { ...prev, modelIds: [...prev.modelIds, id] };
    });
    return result;
  }, []);

  const setFieldMode = useCallback((field: FieldKey, mode: InputMode) => {
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], mode } }));
  }, []);

  const setFieldText = useCallback((field: FieldKey, text: string) => {
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], text } }));
  }, []);

  const reset = useCallback(() => {
    setScenario({ ...DEFAULT_SCENARIO, modelIds: defaultSelection(catalog) });
    setFields({
      system: { mode: 'slider', text: '' },
      user: { mode: 'slider', text: '' },
      output: { mode: 'slider', text: '' },
    });
  }, [catalog]);

  return {
    scenario,
    fields,
    models,
    rows,
    insights,
    update,
    updateNumber,
    toggleModel,
    setFieldMode,
    setFieldText,
    tokensForModel,
    reset,
  };
}

export function scenarioScale(scenario: Scenario) {
  return {
    conversationsPerDay: scenario.conversationsPerDay,
    monthlyActiveUsers: scenario.monthlyActiveUsers,
    revenuePerUserPerMonth: scenario.revenuePerUserPerMonth,
  };
}

/**
 * Token count shown next to a field label. Uses the first selected model, since
 * that is the one whose tokenizer the label's method refers to.
 */
export function fieldTokenCount(
  field: FieldState,
  sliderValue: number,
  model: Model | undefined,
): { tokens: number; estimated: boolean } {
  if (field.mode !== 'paste') return { tokens: sliderValue, estimated: false };
  if (field.text.length === 0) return { tokens: 0, estimated: false };
  return { tokens: estimateTokens(field.text, model?.tokenizer), estimated: true };
}
