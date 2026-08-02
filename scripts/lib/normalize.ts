/**
 * Turning third-party catalogues into our schema.
 *
 * Everything here is pure so the merge rules can be unit-tested against
 * fixtures without touching the network.
 */
import type { Model, TokenizerSpec } from '../../src/lib/pricing/types';

export interface RawRate {
  /** Canonical id in our catalog (slugified source key). */
  id: string;
  /** The key exactly as it appeared upstream, for traceability. */
  sourceKey: string;
  providerId: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  contextWindow?: number;
  maxOutput?: number;
}

export interface FamilyRule {
  id: string;
  providerId: string;
  /** Regexes (as strings) matched against the upstream key. */
  include: string[];
  exclude?: string[];
  tokenizer: TokenizerSpec;
  capabilities: { reasoning: boolean; vision: boolean };
  /** Strip this prefix when deriving a display name. */
  stripPrefix?: string;
}

export interface Allowlist {
  providers: { id: string; name: string; country: string; pricingUrl?: string }[];
  families: FamilyRule[];
  /** Keys matching any of these are never captured, whatever the family says. */
  globalExclude: string[];
}

export function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Title-case a model key into something a human would recognise. */
export function prettyName(key: string, stripPrefix?: string): string {
  let name = key;
  if (stripPrefix && name.startsWith(stripPrefix)) name = name.slice(stripPrefix.length);
  name = name.replace(/^[a-z0-9-]+\//, '');
  name = name.replace(/[-_]/g, ' ');
  name = name.replace(/\b(gpt|glm|api)\b/gi, (m) => m.toUpperCase());
  return name
    .split(' ')
    .map((word) => {
      if (/^[A-Z0-9.]+$/.test(word)) return word;
      if (/^\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchFamily(key: string, allowlist: Allowlist): FamilyRule | null {
  if (allowlist.globalExclude.some((pattern) => new RegExp(pattern).test(key))) return null;
  for (const family of allowlist.families) {
    const excluded = family.exclude?.some((pattern) => new RegExp(pattern).test(key)) ?? false;
    if (excluded) continue;
    if (family.include.some((pattern) => new RegExp(pattern).test(key))) return family;
  }
  return null;
}

/** LiteLLM's community catalogue: `{ "<key>": { input_cost_per_token, ... } }`. */
export function fromLiteLLM(catalog: Record<string, unknown>, allowlist: Allowlist): RawRate[] {
  const rates: RawRate[] = [];

  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (entry.mode !== 'chat') continue;

    const family = matchFamily(key, allowlist);
    if (!family) continue;

    const input = entry.input_cost_per_token;
    const output = entry.output_cost_per_token;
    if (typeof input !== 'number' || typeof output !== 'number') continue;
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;

    const cached = entry.cache_read_input_token_cost;

    rates.push({
      id: slugify(key),
      sourceKey: key,
      providerId: family.providerId,
      inputPerMillion: round6(input * 1e6),
      outputPerMillion: round6(output * 1e6),
      ...(typeof cached === 'number' && cached > 0 ? { cachedInputPerMillion: round6(cached * 1e6) } : {}),
      ...(typeof entry.max_input_tokens === 'number'
        ? { contextWindow: Math.round(entry.max_input_tokens) }
        : {}),
      ...(typeof entry.max_output_tokens === 'number'
        ? { maxOutput: Math.round(entry.max_output_tokens) }
        : {}),
    });
  }

  return rates.sort((a, b) => a.id.localeCompare(b.id));
}

interface OpenRouterModel {
  id?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  context_length?: unknown;
}

/** OpenRouter's `/api/v1/models`, used only as an independent cross-check. */
export function fromOpenRouter(payload: unknown): Map<string, RawRate> {
  const out = new Map<string, RawRate>();
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return out;

  for (const item of data as OpenRouterModel[]) {
    if (typeof item?.id !== 'string') continue;
    const prompt = Number(item.pricing?.prompt);
    const completion = Number(item.pricing?.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
    if (prompt <= 0 && completion <= 0) continue;

    const rate: RawRate = {
      id: slugify(item.id),
      sourceKey: item.id,
      providerId: item.id.split('/')[0] ?? 'unknown',
      inputPerMillion: round6(prompt * 1e6),
      outputPerMillion: round6(completion * 1e6),
      ...(typeof item.context_length === 'number' ? { contextWindow: Math.round(item.context_length) } : {}),
    };
    out.set(comparisonKey(item.id), rate);
  }
  return out;
}

/**
 * A loose key for matching the same model across catalogues whose naming
 * conventions differ (`moonshot/kimi-k2.6` vs `moonshotai/kimi-k2.6`).
 * Only the leaf name survives, stripped to alphanumerics.
 */
export function comparisonKey(key: string): string {
  const leaf = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
  return leaf.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Fields a hand-verified override may set. Anything absent falls through. */
export interface Override {
  id: string;
  providerId?: string;
  displayName?: string;
  status?: Model['status'];
  releaseDate?: string;
  contextWindow?: number;
  maxOutput?: number;
  capabilityIndex?: number;
  capabilities?: { reasoning: boolean; vision: boolean };
  tokenizer?: TokenizerSpec;
  pricing?: Partial<Model['pricing']>;
  /** When true, these prices come from the vendor's own page. */
  vendorVerified?: boolean;
  lastVerified?: string;
}
