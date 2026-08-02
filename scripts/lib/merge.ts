/**
 * The trust ladder (see docs/ARCHITECTURE.md):
 *   1. hand-verified vendor overrides   — always win
 *   2. the LiteLLM community catalogue  — the automated feed
 *   3. OpenRouter                       — cross-check only, never a source
 *   4. sanity rules                     — anything suspicious needs a human
 */
import type { Model, PricingCatalog } from '../../src/lib/pricing/types';
import { SCHEMA_VERSION } from '../../src/lib/pricing/types';
import {
  comparisonKey,
  matchFamily,
  prettyName,
  type Allowlist,
  type Override,
  type RawRate,
} from './normalize';

/** Cross-source disagreement beyond this fraction gets flagged, not published. */
export const DISAGREEMENT_THRESHOLD = 0.2;
/** A day-over-day move beyond this fraction requires human sign-off. */
export const CHANGE_REVIEW_THRESHOLD = 0.5;

export interface MergeInput {
  litellm: RawRate[];
  openrouter: Map<string, RawRate>;
  allowlist: Allowlist;
  overrides: Override[];
  previous?: PricingCatalog | undefined;
  generatedAt: Date;
}

export interface MergeResult {
  catalog: PricingCatalog;
  /** Models whose numbers a human should look at before publishing. */
  review: { id: string; reason: string }[];
}

export function mergeCatalog(input: MergeInput): MergeResult {
  const { litellm, openrouter, allowlist, overrides, previous, generatedAt } = input;
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const previousById = new Map((previous?.models ?? []).map((m) => [m.id, m]));
  const review: { id: string; reason: string }[] = [];
  const models: Model[] = [];
  const isoDate = generatedAt.toISOString().slice(0, 10);

  // Every id we should end up with: everything the feed matched, plus every
  // override (so a hand-curated model survives even if upstream drops it).
  const ids = new Set<string>([...litellm.map((r) => r.id), ...overrideById.keys()]);

  for (const id of [...ids].sort()) {
    const feed = litellm.find((r) => r.id === id);
    const override = overrideById.get(id);
    if (!feed && !override?.pricing) continue;

    const family = feed ? matchFamily(feed.sourceKey, allowlist) : null;
    const providerId = override?.providerId ?? feed?.providerId;
    if (!providerId) continue;

    const input_ = override?.pricing?.input ?? feed?.inputPerMillion;
    const output = override?.pricing?.output ?? feed?.outputPerMillion;
    if (typeof input_ !== 'number' || typeof output !== 'number') continue;

    const cachedInput = override?.pricing?.cachedInput ?? feed?.cachedInputPerMillion;
    const source: Model['provenance']['source'] = override?.vendorVerified
      ? 'vendor'
      : feed
        ? 'litellm'
        : 'vendor';

    const reasons: string[] = [];

    // Rung 3: independent cross-check. Never overwrites, only raises a hand.
    if (feed && !override?.vendorVerified) {
      const peer = openrouter.get(comparisonKey(feed.sourceKey));
      if (peer) {
        const inputGap = relativeGap(input_, peer.inputPerMillion);
        const outputGap = relativeGap(output, peer.outputPerMillion);
        if (inputGap > DISAGREEMENT_THRESHOLD || outputGap > DISAGREEMENT_THRESHOLD) {
          reasons.push(
            `OpenRouter disagrees (${formatPct(Math.max(inputGap, outputGap))}): ` +
              `$${peer.inputPerMillion}/$${peer.outputPerMillion} vs $${input_}/$${output}`,
          );
        }
      }
    }

    // Rung 4: sanity rules against yesterday's published numbers.
    const before = previousById.get(id);
    if (before) {
      const inputMove = relativeGap(before.pricing.input, input_);
      const outputMove = relativeGap(before.pricing.output, output);
      if (inputMove > CHANGE_REVIEW_THRESHOLD || outputMove > CHANGE_REVIEW_THRESHOLD) {
        reasons.push(
          `price moved ${formatPct(Math.max(inputMove, outputMove))} in one day ` +
            `($${before.pricing.input}/$${before.pricing.output} -> $${input_}/$${output})`,
        );
      }
    } else if (!override && previous) {
      // Only interesting once there is a published catalog to be new *against*;
      // on a cold start every model is "new" and the flag would be noise.
      reasons.push('new model discovered by pattern match — confirm name and rates');
    }

    const tokenizer = override?.tokenizer ??
      family?.tokenizer ?? {
        kind: 'approx' as const,
        charsPerToken: 3.8,
        cjkCharsPerToken: 1.5,
      };

    const model: Model = {
      id,
      providerId,
      displayName:
        override?.displayName ?? prettyName(feed?.sourceKey ?? id, family?.stripPrefix ?? undefined),
      status: override?.status ?? 'current',
      contextWindow: override?.contextWindow ?? feed?.contextWindow ?? 128_000,
      pricing: {
        input: input_,
        output,
        ...(cachedInput !== undefined ? { cachedInput } : {}),
        ...(override?.pricing?.cacheWrite !== undefined ? { cacheWrite: override.pricing.cacheWrite } : {}),
        ...(override?.pricing?.batchDiscount !== undefined
          ? { batchDiscount: override.pricing.batchDiscount }
          : {}),
        ...(override?.pricing?.intro ? { intro: override.pricing.intro } : {}),
      },
      tokenizer,
      capabilities: override?.capabilities ?? family?.capabilities ?? { reasoning: false, vision: false },
      provenance: {
        source,
        lastVerified: override?.lastVerified ?? isoDate,
        ...(reasons.length > 0 ? { needsReview: true, reviewNote: reasons.join('; ') } : {}),
      },
      ...(override?.releaseDate ? { releaseDate: override.releaseDate } : {}),
      ...((override?.maxOutput ?? feed?.maxOutput)
        ? { maxOutput: override?.maxOutput ?? feed?.maxOutput }
        : {}),
      ...(override?.capabilityIndex !== undefined ? { capabilityIndex: override.capabilityIndex } : {}),
    };

    models.push(model);
    for (const reason of reasons) review.push({ id, reason });
  }

  const usedProviders = new Set(models.map((m) => m.providerId));
  const catalog: PricingCatalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    providers: allowlist.providers.filter((p) => usedProviders.has(p.id)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
  };

  return { catalog, review };
}

export function relativeGap(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
