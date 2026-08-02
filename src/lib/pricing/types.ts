/**
 * Shape of `public/data/pricing.json` — the single artifact the daily sync
 * pipeline produces and the whole app consumes. Bump `SCHEMA_VERSION` (and the
 * loader's migration path) if any field changes meaning.
 */
export const SCHEMA_VERSION = 1;

export type ModelStatus = 'current' | 'legacy' | 'deprecated';

/** How a token count for this family is arrived at. */
export type TokenizerSpec =
  | { kind: 'tiktoken'; encoding: 'o200k_base' | 'cl100k_base' }
  | { kind: 'approx'; charsPerToken: number; cjkCharsPerToken: number; note?: string };

export interface Pricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M input tokens served from the provider's prompt cache. */
  cachedInput?: number;
  /** USD per 1M tokens to write the cache (Anthropic-style), when published. */
  cacheWrite?: number;
  /** Multiplier applied to both rates when the batch API is used (e.g. 0.5). */
  batchDiscount?: number;
  /** Promotional pricing that expires — engine honours it up to `until`. */
  intro?: { input: number; output: number; until: string };
}

export interface Provider {
  id: string;
  name: string;
  /** ISO-3166 alpha-2 of the operating company's home country. */
  country: string;
  pricingUrl?: string;
}

export interface Provenance {
  /** Which rung of the trust ladder this row came from. */
  source: 'vendor' | 'litellm' | 'openrouter';
  /** ISO date (YYYY-MM-DD) the price was last confirmed. */
  lastVerified: string;
  /** Set when automated sources disagreed and a human has not adjudicated yet. */
  needsReview?: boolean;
  reviewNote?: string;
}

export interface Model {
  id: string;
  providerId: string;
  displayName: string;
  status: ModelStatus;
  releaseDate?: string;
  contextWindow: number;
  maxOutput?: number;
  pricing: Pricing;
  tokenizer: TokenizerSpec;
  capabilities: { reasoning: boolean; vision: boolean };
  /** Rough 0–100 capability index, used only for the value map's Y axis. */
  capabilityIndex?: number;
  provenance: Provenance;
}

export interface PricingCatalog {
  schemaVersion: number;
  generatedAt: string;
  providers: Provider[];
  models: Model[];
}

/** Narrow an unknown JSON blob to a catalog, throwing on anything malformed. */
export function assertCatalog(value: unknown): asserts value is PricingCatalog {
  const errors = validateCatalog(value);
  if (errors.length > 0) {
    throw new Error(`Invalid pricing catalog:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * Structural + sanity validation. Returns a list of human-readable problems so
 * the sync pipeline can print them all at once rather than failing on the first.
 */
export function validateCatalog(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) return ['catalog is not an object'];
  const cat = value as Partial<PricingCatalog>;

  if (cat.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${String(cat.schemaVersion)}`);
  }
  if (typeof cat.generatedAt !== 'string' || Number.isNaN(Date.parse(cat.generatedAt))) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (!Array.isArray(cat.providers) || cat.providers.length === 0) {
    errors.push('providers must be a non-empty array');
  }
  if (!Array.isArray(cat.models) || cat.models.length === 0) {
    errors.push('models must be a non-empty array');
    return errors;
  }

  const providerIds = new Set((cat.providers ?? []).map((p) => p.id));
  const seen = new Set<string>();

  for (const model of cat.models) {
    const label = model?.id ?? '(missing id)';
    if (!model?.id) errors.push('a model is missing an id');
    else if (seen.has(model.id)) errors.push(`duplicate model id: ${model.id}`);
    else seen.add(model.id);

    if (!providerIds.has(model?.providerId)) {
      errors.push(`${label}: providerId "${model?.providerId}" is not in providers[]`);
    }
    if (typeof model?.displayName !== 'string' || model.displayName.length === 0) {
      errors.push(`${label}: displayName is required`);
    }
    const p = model?.pricing;
    if (!p) {
      errors.push(`${label}: pricing block is missing`);
      continue;
    }
    for (const key of ['input', 'output'] as const) {
      const rate = p[key];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
        errors.push(`${label}: pricing.${key} must be a non-negative number`);
      }
    }
    // A free tier is legitimate (some providers publish $0); only flag negatives
    // and the physically implausible case of output costing less than a tenth
    // of input, which in practice has always meant a parsing error upstream.
    if (typeof p.input === 'number' && typeof p.output === 'number') {
      if (p.output > 0 && p.input > 0 && p.output < p.input / 10) {
        errors.push(
          `${label}: output ($${p.output}) is implausibly low versus input ($${p.input}) — likely a source error`,
        );
      }
    }
    if (typeof model?.contextWindow !== 'number' || model.contextWindow <= 0) {
      errors.push(`${label}: contextWindow must be a positive number`);
    }
    if (!model?.tokenizer) errors.push(`${label}: tokenizer spec is required`);
    if (!model?.provenance?.source) errors.push(`${label}: provenance.source is required`);
    if (!model?.provenance?.lastVerified) errors.push(`${label}: provenance.lastVerified is required`);
  }
  return errors;
}
