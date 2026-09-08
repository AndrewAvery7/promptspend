/**
 * Compatibility export for the website. The scenario URL contract lives in
 * packages/core so the website and native apps cannot drift apart.
 */
export {
  DEFAULT_SCENARIO,
  FIELD_KEYS,
  LIMITS,
  MAX_MODELS,
  SCENARIO_PARAM_KEYS,
  clampField,
  decodeScenario,
  encodeScenario,
  type FieldKey,
  type Scenario,
} from '../../../packages/core/src/url/scenario';
