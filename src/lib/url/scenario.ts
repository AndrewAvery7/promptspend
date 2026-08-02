/**
 * Scenario <-> URL serialisation, so any estimate can be shared as a link.
 *
 * Pasted prompt text is deliberately *never* encoded: it is often proprietary,
 * URLs leak into logs and chat history, and the token counts alone reproduce
 * the numbers exactly. Only the derived counts travel.
 */

export interface Scenario {
  modelIds: string[];
  systemTokens: number;
  userTokens: number;
  outputTokens: number;
  turns: number;
  conversationsPerDay: number;
  monthlyActiveUsers: number;
  revenuePerUserPerMonth: number;
  cachedInputShare: number;
  reasoningMultiplier: number;
  useBatchApi: boolean;
}

export const DEFAULT_SCENARIO: Scenario = {
  modelIds: [],
  systemTokens: 800,
  userTokens: 400,
  outputTokens: 900,
  turns: 6,
  conversationsPerDay: 2500,
  monthlyActiveUsers: 1500,
  revenuePerUserPerMonth: 12,
  cachedInputShare: 0.6,
  reasoningMultiplier: 1,
  useBatchApi: false,
};

export const LIMITS = {
  systemTokens: [0, 200_000],
  userTokens: [0, 200_000],
  outputTokens: [0, 200_000],
  turns: [1, 200],
  conversationsPerDay: [0, 100_000_000],
  monthlyActiveUsers: [1, 100_000_000],
  revenuePerUserPerMonth: [0, 100_000],
  cachedInputShare: [0, 1],
  reasoningMultiplier: [1, 10],
} as const satisfies Record<string, readonly [number, number]>;

export function clampField<K extends keyof typeof LIMITS>(field: K, value: number): number {
  const [min, max] = LIMITS[field];
  if (!Number.isFinite(value)) return DEFAULT_SCENARIO[field] as number;
  return Math.min(max, Math.max(min, value));
}

const KEYS = {
  modelIds: 'm',
  systemTokens: 'sys',
  userTokens: 'usr',
  outputTokens: 'out',
  turns: 't',
  conversationsPerDay: 'cpd',
  monthlyActiveUsers: 'mau',
  revenuePerUserPerMonth: 'rev',
  cachedInputShare: 'cache',
  reasoningMultiplier: 'rsn',
  useBatchApi: 'batch',
} as const;

export function encodeScenario(scenario: Scenario): string {
  const params = new URLSearchParams();
  if (scenario.modelIds.length > 0) params.set(KEYS.modelIds, scenario.modelIds.join(','));
  params.set(KEYS.systemTokens, String(Math.round(scenario.systemTokens)));
  params.set(KEYS.userTokens, String(Math.round(scenario.userTokens)));
  params.set(KEYS.outputTokens, String(Math.round(scenario.outputTokens)));
  params.set(KEYS.turns, String(Math.round(scenario.turns)));
  params.set(KEYS.conversationsPerDay, String(Math.round(scenario.conversationsPerDay)));
  params.set(KEYS.monthlyActiveUsers, String(Math.round(scenario.monthlyActiveUsers)));
  params.set(KEYS.revenuePerUserPerMonth, String(scenario.revenuePerUserPerMonth));
  params.set(KEYS.cachedInputShare, scenario.cachedInputShare.toFixed(2));
  if (scenario.reasoningMultiplier !== 1) {
    params.set(KEYS.reasoningMultiplier, String(scenario.reasoningMultiplier));
  }
  if (scenario.useBatchApi) params.set(KEYS.useBatchApi, '1');
  return params.toString();
}

export function decodeScenario(search: string, base: Scenario = DEFAULT_SCENARIO): Scenario {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const num = (key: string, fallback: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const modelsRaw = params.get(KEYS.modelIds);
  const modelIds = modelsRaw
    ? modelsRaw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && /^[\w.:-]+$/.test(id))
        .slice(0, MAX_MODELS)
    : base.modelIds;

  return {
    modelIds,
    systemTokens: clampField('systemTokens', num(KEYS.systemTokens, base.systemTokens)),
    userTokens: clampField('userTokens', num(KEYS.userTokens, base.userTokens)),
    outputTokens: clampField('outputTokens', num(KEYS.outputTokens, base.outputTokens)),
    turns: Math.round(clampField('turns', num(KEYS.turns, base.turns))),
    conversationsPerDay: clampField(
      'conversationsPerDay',
      num(KEYS.conversationsPerDay, base.conversationsPerDay),
    ),
    monthlyActiveUsers: clampField(
      'monthlyActiveUsers',
      num(KEYS.monthlyActiveUsers, base.monthlyActiveUsers),
    ),
    revenuePerUserPerMonth: clampField(
      'revenuePerUserPerMonth',
      num(KEYS.revenuePerUserPerMonth, base.revenuePerUserPerMonth),
    ),
    cachedInputShare: clampField('cachedInputShare', num(KEYS.cachedInputShare, base.cachedInputShare)),
    reasoningMultiplier: clampField(
      'reasoningMultiplier',
      num(KEYS.reasoningMultiplier, base.reasoningMultiplier),
    ),
    useBatchApi: params.get(KEYS.useBatchApi) === '1' ? true : base.useBatchApi,
  };
}

/** Comparing more than four models at once stops being readable. */
export const MAX_MODELS = 4;
