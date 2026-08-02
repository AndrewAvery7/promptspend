import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { compareModels, type ComparisonRow, type Workload } from '@/lib/engine/cost';
import { buildInsights } from '@/lib/engine/insights';
import { countTokens, estimateTokens } from '@/lib/tokenize';
import {
  DEFAULT_SCENARIO,
  FIELD_KEYS,
  MAX_MODELS,
  SCENARIO_PARAM_KEYS,
  clampField,
  decodeScenario,
  encodeScenario,
  type FieldKey,
  type Scenario,
} from '@/lib/url/scenario';

export type { FieldKey };
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

/**
 * Enough for a very large system prompt (roughly 50,000 tokens) and small
 * enough that tokenising it never blocks the main thread for long. Text past
 * this point is not silently priced — it is refused, and the UI says so.
 */
export const MAX_PASTE_CHARS = 200_000;

/** Typing pause before the real tokenizer runs. */
const TOKENIZE_DEBOUNCE_MS = 250;

/**
 * Exact counts are cached because tokenising the same string twice is pure
 * waste — but the cache is bounded and keyed by a hash rather than by the text
 * itself. Keying by the text meant every keystroke left another full copy of
 * someone's prompt alive for the rest of the session.
 */
const EXACT_CACHE_LIMIT = 60;

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}.${hash.toString(36)}`;
}

/**
 * Insert into a bounded, insertion-ordered cache, dropping the oldest entries
 * once it is full. A `Map` iterates in insertion order, so eviction is just
 * taking from the front.
 */
function remember(cache: ReadonlyMap<string, number>, key: string, value: number): Map<string, number> {
  const next = new Map(cache);
  next.delete(key);
  next.set(key, value);
  while (next.size > EXACT_CACHE_LIMIT) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/** Pick sensible starting models: a frontier one, a mid-tier one, two budget ones. */
export function defaultSelection(catalog: Catalog): string[] {
  const preferred = ['claude-sonnet-5', 'gpt-5.4', 'deepseek-deepseek-v3.2', 'moonshot-kimi-k2.5'];
  const found = preferred.filter((id) => catalog.get(id) !== undefined);
  if (found.length >= 2) return found.slice(0, MAX_MODELS);

  const sorted = [...catalog.primaryModels].sort((a, b) => a.pricing.output - b.pricing.output);
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

  /**
   * True when the scenario arrived from a shared link that had pasted fields.
   * The counts are real; the text behind them is not ours to have.
   */
  const [restoredFromPaste] = useState(() => decodeScenario(window.location.search).pastedFields.length > 0);

  const [exactCounts, setExactCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [oversized, setOversized] = useState(false);

  const models = useMemo(() => catalog.getAll(scenario.modelIds), [catalog, scenario.modelIds]);

  // Keep the address bar in step so any estimate is shareable by copying the URL.
  //
  // Only the parameters the scenario owns are rewritten. Rebuilding the whole
  // query string was destroying anything else that happened to be there — which
  // is how an emailed `?alerts=` preferences link arrived at a page that had
  // already thrown the token away.
  useEffect(() => {
    const preserved = new URLSearchParams(window.location.search);
    for (const key of SCENARIO_PARAM_KEYS) preserved.delete(key);

    const extra = preserved.toString();
    const query = `${encodeScenario(scenario)}${extra ? `&${extra}` : ''}`;
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }, [scenario]);

  // Real tokenizer counts for the models that have one we can run locally.
  // Debounced, and abandoned wholesale when the inputs change again.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const pending: Promise<void>[] = [];
      for (const model of models) {
        if (model.tokenizer.kind !== 'tiktoken') continue;
        for (const field of FIELD_KEYS) {
          const state = fields[field];
          if (state.mode !== 'paste' || state.text.length === 0) continue;
          const key = `${model.id}|${field}|${hashText(state.text)}`;
          if (exactCounts.has(key)) continue;
          pending.push(
            countTokens(state.text, model).then((result) => {
              if (cancelled || result.method !== 'exact') return;
              setExactCounts((prev) =>
                prev.get(key) === result.tokens ? prev : remember(prev, key, result.tokens),
              );
            }),
          );
        }
      }
      void Promise.all(pending);
    }, TOKENIZE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [models, fields, exactCounts]);

  const tokensForModel = useCallback(
    (model: Model): ModelTokens => {
      let method: ModelTokens['method'] = 'exact';
      const read = (field: FieldKey, sliderValue: number): number => {
        const state = fields[field];
        if (state.mode !== 'paste') return sliderValue;
        if (state.text.length === 0) return 0;
        const exact = exactCounts.get(`${model.id}|${field}|${hashText(state.text)}`);
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

  /**
   * Mirror the counts derived from pasted text back into the scenario.
   *
   * Without this the share link carried whatever the sliders happened to say
   * while the screen showed something else entirely — the URL claimed to
   * restore the estimate and restored a different one. The counts belong to the
   * first selected model, whose tokenizer the field label refers to; the other
   * cards keep costing the text with their own tokenizer, which is the whole
   * point of the comparison.
   */
  useEffect(() => {
    const primary = models[0];
    const pasted = FIELD_KEYS.filter((field) => fields[field].mode === 'paste');
    setScenario((prev) => {
      const next: Scenario = { ...prev };
      let changed = false;

      if (pasted.join(',') !== prev.pastedFields.join(',')) {
        next.pastedFields = pasted;
        changed = true;
      }
      if (primary) {
        const counts = tokensForModel(primary);
        const map = [
          ['system', 'systemTokens'],
          ['user', 'userTokens'],
          ['output', 'outputTokens'],
        ] as const;
        for (const [field, key] of map) {
          if (fields[field].mode !== 'paste') continue;
          const value = clampField(key, counts[field]);
          if (prev[key] !== value) {
            next[key] = value;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [fields, models, tokensForModel]);

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

  const setFieldText = useCallback((field: FieldKey, text: string): { ok: boolean; reason?: string } => {
    if (text.length > MAX_PASTE_CHARS) {
      setOversized(true);
      setFields((prev) => ({ ...prev, [field]: { ...prev[field], text: text.slice(0, MAX_PASTE_CHARS) } }));
      return {
        ok: false,
        reason: `Trimmed to ${MAX_PASTE_CHARS.toLocaleString()} characters — paste a representative sample instead`,
      };
    }
    setOversized(false);
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], text } }));
    return { ok: true };
  }, []);

  const reset = useCallback(() => {
    setScenario({ ...DEFAULT_SCENARIO, modelIds: defaultSelection(catalog) });
    setFields({
      system: { mode: 'slider', text: '' },
      user: { mode: 'slider', text: '' },
      output: { mode: 'slider', text: '' },
    });
    setExactCounts(new Map());
    setOversized(false);
  }, [catalog]);

  const hasPastedText = FIELD_KEYS.some((f) => fields[f].mode === 'paste' && fields[f].text.length > 0);

  return {
    scenario,
    fields,
    models,
    rows,
    insights,
    oversized,
    /** A shared link brought counts from someone else's prompt, not the text. */
    restoredFromPaste: restoredFromPaste && !hasPastedText,
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
