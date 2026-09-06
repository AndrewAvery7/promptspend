import { DEFAULT_SCENARIO, SCENARIO_PARAM_KEYS, decodeScenario, type Scenario } from '@promptspend/core';

export type SharedScenarioParams = Record<string, string | string[] | undefined>;

export function readSharedScenario(
  params: SharedScenarioParams,
  base: Scenario = DEFAULT_SCENARIO,
): { scenario: Scenario; signature: string } | null {
  const search = new URLSearchParams();
  for (const key of SCENARIO_PARAM_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim() !== '') search.set(key, value);
  }
  const signature = search.toString();
  if (!signature) return null;
  return { scenario: decodeScenario(signature, base), signature };
}
