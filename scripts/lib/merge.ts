/**
 * The trust ladder (see docs/ARCHITECTURE.md):
 *   1. hand-verified vendor overrides   — always win
 *   2. the LiteLLM community catalogue  — the automated feed
 *   3. OpenRouter                       — cross-check only, never a source
 *   4. sanity rules                     — anything suspicious needs a human
 *
 * Two properties this file is responsible for:
 *
 *   Nothing vanishes quietly. A model that was published yesterday and is
 *   missing from today's feed is kept and marked `stale`, not deleted. One
 *   truncated upstream response must never be able to empty the catalog.
 *
 *   A flag is raised once. Review reasons are compared against what was
 *   already recorded, so a long-standing disagreement does not re-open a pull
 *   request every morning and drown the genuinely new ones.
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

export interface ReviewItem {
  id: string;
  reason: string;
  /** False when the same reason was already recorded in the published catalog. */
  isNew: boolean;
}

export interface MergeResult {
  catalog: PricingCatalog;
  /** Models whose numbers a human should look at before publishing. */
  review: ReviewItem[];
  /** Ids that were published yesterday and are missing from today's feed. */
  stale: string[];
}

export function mergeCatalog(input: MergeInput): MergeResult {
  const { litellm, openrouter, allowlist, overrides, previous, generatedAt } = input;
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const previousById = new Map((previous?.models ?? []).map((m) => [m.id, m]));
  const feedById = new Map(litellm.map((r) => [r.id, r]));
  const review: ReviewItem[] = [];
  const staleIds: string[] = [];
  const models: Model[] = [];
  const isoDate = generatedAt.toISOString().slice(0, 10);

  // Every id we should end up with: everything the feed matched, every
  // override (so a hand-curated model survives upstream dropping it) and
  // everything already published (so a bad fetch cannot delete the catalog).
  const ids = new Set<string>([...feedById.keys(), ...overrideById.keys(), ...previousById.keys()]);
  for (const id of allowlist.retired ?? []) ids.delete(id);

  for (const id of [...ids].sort()) {
    const feed = feedById.get(id);
    const override = overrideById.get(id);
    const before = previousById.get(id);

    // Missing upstream and not hand-curated: keep yesterday's row, mark it.
    if (!feed && !override?.pricing) {
      if (!before) continue;
      const reason = 'no longer listed upstream — confirm retirement before removing';
      const wasStale = before.provenance.stale === true;
      staleIds.push(id);
      models.push({
        ...before,
        provenance: {
          ...before.provenance,
          stale: true,
          needsReview: true,
          reviewNote: mergeNote(before.provenance.reviewNote, reason),
        },
      });
      review.push({ id, reason, isNew: !wasStale });
      continue;
    }

    const family = feed ? matchFamily(feed.sourceKey, allowlist) : null;
    const providerId = override?.providerId ?? feed?.providerId ?? before?.providerId;
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
    const ratesMoved =
      before !== undefined && (before.pricing.input !== input_ || before.pricing.output !== output);
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
      family?.tokenizer ??
      before?.tokenizer ?? {
        kind: 'approx' as const,
        charsPerToken: 3.8,
        cjkCharsPerToken: 1.5,
      };

    // "Last changed" is what the freshness badge should actually show: the day
    // the numbers moved, not the day a job happened to run.
    const lastChanged = !before ? isoDate : ratesMoved ? isoDate : (before.provenance.lastChanged ?? isoDate);

    const model: Model = {
      id,
      providerId,
      displayName:
        override?.displayName ??
        before?.displayName ??
        prettyName(feed?.sourceKey ?? id, family?.stripPrefix ?? undefined),
      status: override?.status ?? before?.status ?? 'current',
      contextWindow: override?.contextWindow ?? feed?.contextWindow ?? before?.contextWindow ?? 128_000,
      pricing: {
        input: input_,
        output,
        ...(cachedInput !== undefined ? { cachedInput } : {}),
        ...(override?.pricing?.cacheWrite !== undefined ? { cacheWrite: override.pricing.cacheWrite } : {}),
        ...(override?.pricing?.batchDiscount !== undefined
          ? { batchDiscount: override.pricing.batchDiscount }
          : {}),
        ...(override?.pricing?.intro ? { intro: override.pricing.intro } : {}),
        ...(override?.pricing?.longContext ? { longContext: override.pricing.longContext } : {}),
      },
      tokenizer,
      capabilities: override?.capabilities ??
        family?.capabilities ??
        before?.capabilities ?? { reasoning: false, vision: false },
      provenance: {
        source,
        lastVerified: override?.lastVerified ?? isoDate,
        lastChanged,
        ...(override?.verifiedUrl ? { verifiedUrl: override.verifiedUrl } : {}),
        ...(reasons.length > 0 ? { needsReview: true, reviewNote: reasons.join('; ') } : {}),
      },
      ...(override?.aliasOf ? { aliasOf: override.aliasOf } : {}),
      ...(override?.releaseDate ? { releaseDate: override.releaseDate } : {}),
      ...((override?.maxOutput ?? feed?.maxOutput ?? before?.maxOutput)
        ? { maxOutput: override?.maxOutput ?? feed?.maxOutput ?? before?.maxOutput }
        : {}),
      ...(override?.capabilityIndex !== undefined ? { capabilityIndex: override.capabilityIndex } : {}),
    };

    models.push(model);
    for (const reason of reasons) {
      review.push({ id, reason, isNew: !(before?.provenance.reviewNote ?? '').includes(reason) });
    }
  }

  const usedProviders = new Set(models.map((m) => m.providerId));
  const catalog: PricingCatalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    providers: allowlist.providers.filter((p) => usedProviders.has(p.id)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
  };

  return { catalog, review, stale: staleIds };
}

/** Keep an existing note but do not repeat a reason already recorded in it. */
function mergeNote(existing: string | undefined, reason: string): string {
  if (!existing) return reason;
  return existing.includes(reason) ? existing : `${existing}; ${reason}`;
}

export function relativeGap(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
