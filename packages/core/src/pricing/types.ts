/**
 * Shape of `public/data/pricing.json` — the single artifact the daily sync
 * pipeline produces and the whole app consumes. Bump `SCHEMA_VERSION` (and the
 * loader's migration path) if any field changes meaning.
 *
 * v2 added: `pricing.cacheWrite`, `pricing.longContext`, `Model.aliasOf`,
 * `provenance.verifiedUrl`, `provenance.lastChanged` and `provenance.stale`.
 */
export const SCHEMA_VERSION = 2;

export type ModelStatus = 'current' | 'legacy' | 'deprecated';

/** How a token count for this family is arrived at. */
export type TokenizerSpec =
  | { kind: 'tiktoken'; encoding: 'o200k_base' | 'cl100k_base' }
  | { kind: 'approx'; charsPerToken: number; cjkCharsPerToken: number; note?: string };

/**
 * A published rate tier that replaces the base rates once a request's input
 * crosses `thresholdTokens`. OpenAI's GPT-5.x families bill the *entire*
 * request at 2× input / 1.5× output above 272K input tokens, so the engine
 * swaps rates wholesale rather than charging only the excess.
 */
export interface LongContextTier {
  /** Input tokens in one request above which this tier applies. */
  thresholdTokens: number;
  input: number;
  output: number;
  cachedInput?: number;
  cacheWrite?: number;
}

export interface Pricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M input tokens served from the provider's prompt cache. */
  cachedInput?: number;
  /** USD per 1M tokens to *write* the cache. Both OpenAI and Anthropic charge
   *  1.25× base input; it is billed once per cached prefix, not per read. */
  cacheWrite?: number;
  /** Multiplier applied to both rates when the batch API is used (e.g. 0.5). */
  batchDiscount?: number;
  /** Promotional pricing that expires — engine honours it up to `until`.
   *  Cache rates move with the promotion where the vendor publishes them. */
  intro?: { input: number; output: number; cachedInput?: number; cacheWrite?: number; until: string };
  /** Rates that replace the base ones for requests above a token threshold. */
  longContext?: LongContextTier;
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
  /** ISO date (YYYY-MM-DD) the price was last confirmed against its source. */
  lastVerified: string;
  /** ISO date (YYYY-MM-DD) the published rates last actually moved. */
  lastChanged?: string;
  /** The vendor page a human checked, for rows verified by hand. */
  verifiedUrl?: string;
  /** Set when automated sources disagreed and a human has not adjudicated yet. */
  needsReview?: boolean;
  reviewNote?: string;
  /** Stable identifiers for *why* review was raised, one per reason.
   *
   *  `reviewNote` is the human-facing rendering of the same reasons and embeds
   *  live figures — the disagreement percentage and both sides' rates — so it
   *  changes whenever a rate drifts by a rounding step. Keying "have we already
   *  raised this?" on that text made a standing disagreement look brand new
   *  every morning and opened a pull request per day. Codes do not move.
   *
   *  Written and read only by the sync pipeline, so this is additive: no app
   *  reader consumes it and `SCHEMA_VERSION` does not need to move. */
  reviewCodes?: string[];
  /** Set when upstream stopped listing the model but no retirement has been
   *  confirmed. The row is kept and marked rather than silently deleted. */
  stale?: boolean;
}

export interface Model {
  id: string;
  providerId: string;
  displayName: string;
  status: ModelStatus;
  /** Set when this id is a routing alias for another catalog entry (e.g.
   *  `gpt-5.6` routes to `gpt-5.6-sol`). Aliases are hidden from pickers and
   *  charts so one purchasable model is not presented as two. */
  aliasOf?: string;
  releaseDate?: string;
  contextWindow: number;
  maxOutput?: number;
  pricing: Pricing;
  tokenizer: TokenizerSpec;
  capabilities: { reasoning: boolean; vision: boolean };
  /** Rough 0–100 capability estimate, used only for the value map's Y axis.
   *  Absent means "not scored" — the UI must not substitute a number. */
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[\w.:-]+$/;
const STATUSES: ModelStatus[] = ['current', 'legacy', 'deprecated'];
const SOURCES: Provenance['source'][] = ['vendor', 'litellm', 'openrouter'];
const ENCODINGS = ['o200k_base', 'cl100k_base'];

/**
 * Structural + sanity validation. Returns a list of human-readable problems so
 * the sync pipeline can print them all at once rather than failing on the first.
 *
 * Deliberately hand-written rather than schema-library-driven: the app ships
 * with no runtime dependency beyond React, and this is the one place where the
 * *sanity* rules — not just the shapes — are written down.
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

  const providerIds = new Set<string>();
  for (const provider of cat.providers ?? []) {
    const label = provider?.id ?? '(missing id)';
    if (typeof provider?.id !== 'string' || !SLUG.test(provider.id)) {
      errors.push(`provider ${label}: id must be a slug`);
    } else if (providerIds.has(provider.id)) {
      errors.push(`duplicate provider id: ${provider.id}`);
    } else {
      providerIds.add(provider.id);
    }
    if (typeof provider?.name !== 'string' || provider.name.length === 0) {
      errors.push(`provider ${label}: name is required`);
    }
    if (typeof provider?.country !== 'string' || !/^[A-Z]{2}$/.test(provider.country)) {
      errors.push(`provider ${label}: country must be an ISO-3166 alpha-2 code`);
    }
    if (provider?.pricingUrl !== undefined && !/^https:\/\//.test(provider.pricingUrl)) {
      errors.push(`provider ${label}: pricingUrl must be https`);
    }
  }

  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const model of cat.models) {
    if (typeof model?.id === 'string' && model.id.length > 0) ids.add(model.id);
  }

  for (const model of cat.models) {
    const label = model?.id ?? '(missing id)';
    if (typeof model?.id !== 'string' || !SLUG.test(model.id)) {
      errors.push(`${label}: id must be a slug`);
    } else if (seen.has(model.id)) {
      errors.push(`duplicate model id: ${model.id}`);
    } else {
      seen.add(model.id);
    }
    if (!providerIds.has(model?.providerId as string)) {
      errors.push(`${label}: providerId "${model?.providerId}" is not in providers[]`);
    }
    if (typeof model?.displayName !== 'string' || model.displayName.length === 0) {
      errors.push(`${label}: displayName is required`);
    }
    if (!STATUSES.includes(model?.status as ModelStatus)) {
      errors.push(`${label}: status must be one of ${STATUSES.join(', ')}`);
    }
    if (model?.aliasOf !== undefined) {
      if (model.aliasOf === model.id) errors.push(`${label}: aliasOf points at itself`);
      else if (!ids.has(model.aliasOf)) {
        errors.push(`${label}: aliasOf "${model.aliasOf}" is not a known model`);
      }
    }
    if (model?.releaseDate !== undefined && !ISO_DATE.test(model.releaseDate)) {
      errors.push(`${label}: releaseDate must be YYYY-MM-DD`);
    }
    if (!Number.isInteger(model?.contextWindow) || (model?.contextWindow ?? 0) <= 0) {
      errors.push(`${label}: contextWindow must be a positive integer`);
    }
    if (model?.maxOutput !== undefined) {
      if (!Number.isInteger(model.maxOutput) || model.maxOutput <= 0) {
        errors.push(`${label}: maxOutput must be a positive integer`);
      } else if (Number.isInteger(model.contextWindow) && model.maxOutput > model.contextWindow) {
        errors.push(`${label}: maxOutput (${model.maxOutput}) exceeds contextWindow`);
      }
    }
    if (model?.capabilityIndex !== undefined) {
      const ci: unknown = model.capabilityIndex;
      if (typeof ci !== 'number' || !Number.isFinite(ci) || ci < 0 || ci > 100) {
        errors.push(`${label}: capabilityIndex must be between 0 and 100`);
      }
    }
    for (const flag of ['reasoning', 'vision'] as const) {
      if (typeof model?.capabilities?.[flag] !== 'boolean') {
        errors.push(`${label}: capabilities.${flag} must be a boolean`);
      }
    }

    errors.push(...validateTokenizer(label, model?.tokenizer));
    errors.push(...validatePricing(label, model?.pricing));
    errors.push(...validateProvenance(label, model?.provenance));
  }
  return errors;
}

function validateTokenizer(label: string, spec: unknown): string[] {
  const errors: string[] = [];
  if (typeof spec !== 'object' || spec === null) return [`${label}: tokenizer spec is required`];
  const t = spec as {
    kind?: unknown;
    encoding?: unknown;
    charsPerToken?: unknown;
    cjkCharsPerToken?: unknown;
  };

  if (t.kind === 'tiktoken') {
    if (typeof t.encoding !== 'string' || !ENCODINGS.includes(t.encoding)) {
      errors.push(`${label}: tokenizer.encoding must be one of ${ENCODINGS.join(', ')}`);
    }
  } else if (t.kind === 'approx') {
    for (const key of ['charsPerToken', 'cjkCharsPerToken'] as const) {
      const ratio = t[key];
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio > 20) {
        errors.push(`${label}: tokenizer.${key} must be a plausible ratio (0–20)`);
      }
    }
  } else {
    errors.push(`${label}: tokenizer.kind must be "tiktoken" or "approx"`);
  }
  return errors;
}

function validateRate(label: string, field: string, rate: unknown, errors: string[]): rate is number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    errors.push(`${label}: ${field} must be a non-negative number`);
    return false;
  }
  return true;
}

function validatePricing(label: string, pricing: unknown): string[] {
  const errors: string[] = [];
  if (typeof pricing !== 'object' || pricing === null) return [`${label}: pricing block is missing`];
  const p = pricing as Partial<Pricing>;

  const input = validateRate(label, 'pricing.input', p.input, errors) ? p.input : undefined;
  const output = validateRate(label, 'pricing.output', p.output, errors) ? p.output : undefined;

  // A free tier is legitimate (some providers publish $0); only flag the
  // physically implausible case of output costing less than a tenth of input,
  // which in practice has always meant a parsing error upstream.
  if (input !== undefined && output !== undefined && output > 0 && input > 0 && output < input / 10) {
    errors.push(
      `${label}: output ($${output}) is implausibly low versus input ($${input}) — likely a source error`,
    );
  }

  if (p.cachedInput !== undefined && validateRate(label, 'pricing.cachedInput', p.cachedInput, errors)) {
    if (input !== undefined && p.cachedInput > input) {
      errors.push(`${label}: cachedInput ($${p.cachedInput}) costs more than fresh input ($${input})`);
    }
  }
  if (p.cacheWrite !== undefined && validateRate(label, 'pricing.cacheWrite', p.cacheWrite, errors)) {
    if (input !== undefined && input > 0 && p.cacheWrite < input) {
      errors.push(
        `${label}: cacheWrite ($${p.cacheWrite}) is cheaper than input — every vendor charges more`,
      );
    }
  }
  if (p.batchDiscount !== undefined) {
    if (typeof p.batchDiscount !== 'number' || !(p.batchDiscount > 0) || p.batchDiscount > 1) {
      errors.push(`${label}: batchDiscount must be a multiplier in (0, 1]`);
    }
  }
  if (p.intro !== undefined) {
    validateRate(label, 'pricing.intro.input', p.intro.input, errors);
    validateRate(label, 'pricing.intro.output', p.intro.output, errors);
    if (typeof p.intro.until !== 'string' || !ISO_DATE.test(p.intro.until)) {
      errors.push(`${label}: pricing.intro.until must be YYYY-MM-DD`);
    }
  }
  if (p.longContext !== undefined) {
    const lc = p.longContext;
    if (!Number.isInteger(lc.thresholdTokens) || lc.thresholdTokens <= 0) {
      errors.push(`${label}: longContext.thresholdTokens must be a positive integer`);
    }
    const lcInput = validateRate(label, 'pricing.longContext.input', lc.input, errors);
    validateRate(label, 'pricing.longContext.output', lc.output, errors);
    if (lc.cachedInput !== undefined) {
      validateRate(label, 'pricing.longContext.cachedInput', lc.cachedInput, errors);
    }
    if (lc.cacheWrite !== undefined) {
      validateRate(label, 'pricing.longContext.cacheWrite', lc.cacheWrite, errors);
    }
    if (input !== undefined && lcInput && lc.input < input) {
      errors.push(`${label}: longContext.input is cheaper than the base rate — tiers only ever cost more`);
    }
  }
  return errors;
}

function validateProvenance(label: string, provenance: unknown): string[] {
  const errors: string[] = [];
  if (typeof provenance !== 'object' || provenance === null) {
    return [`${label}: provenance block is missing`];
  }
  const pr = provenance as Partial<Provenance>;

  if (!SOURCES.includes(pr.source as Provenance['source'])) {
    errors.push(`${label}: provenance.source must be one of ${SOURCES.join(', ')}`);
  }
  if (typeof pr.lastVerified !== 'string' || !ISO_DATE.test(pr.lastVerified)) {
    errors.push(`${label}: provenance.lastVerified must be YYYY-MM-DD`);
  }
  if (pr.lastChanged !== undefined && !ISO_DATE.test(pr.lastChanged)) {
    errors.push(`${label}: provenance.lastChanged must be YYYY-MM-DD`);
  }
  if (pr.verifiedUrl !== undefined && !/^https:\/\//.test(pr.verifiedUrl)) {
    errors.push(`${label}: provenance.verifiedUrl must be https`);
  }
  if (pr.needsReview !== undefined && typeof pr.needsReview !== 'boolean') {
    errors.push(`${label}: provenance.needsReview must be a boolean`);
  } else if (pr.needsReview === true && (typeof pr.reviewNote !== 'string' || pr.reviewNote.length === 0)) {
    errors.push(`${label}: needsReview is set but reviewNote is empty`);
  }
  if (
    pr.reviewCodes !== undefined &&
    (!Array.isArray(pr.reviewCodes) || pr.reviewCodes.some((code) => typeof code !== 'string'))
  ) {
    errors.push(`${label}: provenance.reviewCodes must be an array of strings`);
  }
  return errors;
}
