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
 *   A flag is raised once. Review reasons carry a stable `ReviewCode` and are
 *   compared against the codes already recorded, so a long-standing
 *   disagreement does not re-open a pull request every morning and drown the
 *   genuinely new ones. Comparing the rendered *text* is what broke this
 *   before: it embeds the percentage and both sides' rates, so a standing
 *   disagreement that drifted 38% -> 39% read as brand new.
 */
import type { Model, PricingCatalog } from '../../src/lib/pricing/types';
import { SCHEMA_VERSION } from '../../src/lib/pricing/types';
import { pricingChanged } from './diff';
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

/** A stable identifier for *why* review was raised.
 *
 *  Deliberately distinct from the rendered reason text, which embeds live
 *  figures (the disagreement percentage, both sides' rates) and therefore
 *  changes whenever a rate drifts by a rounding step. Anything deciding
 *  "is this flag new?" must key on the code; only humans read the text. */
export type ReviewCode =
  | 'upstream-missing'
  | 'openrouter-disagreement'
  | 'day-move'
  | 'new-model';

/** One raised reason: a stable code plus its human-facing rendering. */
interface Reason {
  code: ReviewCode;
  text: string;
}

export interface ReviewItem {
  id: string;
  reason: string;
  code: ReviewCode;
  /** False when a reason with this code was already recorded in the published
   *  catalog. Compared by code, never by `reason` text — see `ReviewCode`. */
  isNew: boolean;
}

/** A rate that moved because we changed where we read it, not because it moved. */
export interface CorrectionItem {
  id: string;
  from: string | undefined;
  to: string | undefined;
}

export interface MergeResult {
  catalog: PricingCatalog;
  /** Models whose numbers a human should look at before publishing. */
  review: ReviewItem[];
  /** Ids that were published yesterday and are missing from today's feed. */
  stale: string[];
  /** Rates restated by a source change, so `lastChanged` was left alone. */
  corrections: CorrectionItem[];
}

export function mergeCatalog(input: MergeInput): MergeResult {
  const { litellm, openrouter, allowlist, overrides, previous, generatedAt } = input;
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const previousById = new Map((previous?.models ?? []).map((m) => [m.id, m]));
  const feedById = new Map(litellm.map((r) => [r.id, r]));
  const review: ReviewItem[] = [];
  const corrections: CorrectionItem[] = [];
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
      const reason: Reason = {
        code: 'upstream-missing',
        text: 'no longer listed upstream — confirm retirement before removing',
      };
      const wasStale = before.provenance.stale === true;
      staleIds.push(id);
      models.push({
        ...before,
        provenance: {
          ...before.provenance,
          stale: true,
          needsReview: true,
          reviewNote: mergeNote(before.provenance.reviewNote, reason.text),
          reviewCodes: mergeCodes(before.provenance.reviewCodes, [reason.code]),
        },
      });
      // `stale` is already a stable boolean, so it answers "new?" directly.
      review.push({ id, reason: reason.text, code: reason.code, isNew: !wasStale });
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

    const reasons: Reason[] = [];

    // Rung 3: independent cross-check. Never overwrites, only raises a hand.
    if (feed && !override?.vendorVerified) {
      const peer = openrouter.get(comparisonKey(feed.sourceKey));
      if (peer) {
        const inputGap = relativeGap(input_, peer.inputPerMillion);
        const outputGap = relativeGap(output, peer.outputPerMillion);
        if (inputGap > DISAGREEMENT_THRESHOLD || outputGap > DISAGREEMENT_THRESHOLD) {
          reasons.push({
            code: 'openrouter-disagreement',
            text:
              `OpenRouter disagrees (${formatPct(Math.max(inputGap, outputGap))}): ` +
              `$${peer.inputPerMillion}/$${peer.outputPerMillion} vs $${input_}/$${output}`,
          });
        }
      }
    }

    // Rung 4: sanity rules against yesterday's published numbers.
    if (before) {
      const inputMove = relativeGap(before.pricing.input, input_);
      const outputMove = relativeGap(before.pricing.output, output);
      if (inputMove > CHANGE_REVIEW_THRESHOLD || outputMove > CHANGE_REVIEW_THRESHOLD) {
        reasons.push({
          code: 'day-move',
          text:
            `price moved ${formatPct(Math.max(inputMove, outputMove))} in one day ` +
            `($${before.pricing.input}/$${before.pricing.output} -> $${input_}/$${output})`,
        });
      }
    } else if (!override && previous) {
      // Only interesting once there is a published catalog to be new *against*;
      // on a cold start every model is "new" and the flag would be noise.
      reasons.push({
        code: 'new-model',
        text: 'new model discovered by pattern match — confirm name and rates',
      });
    }

    const tokenizer = override?.tokenizer ??
      family?.tokenizer ??
      before?.tokenizer ?? {
        kind: 'approx' as const,
        charsPerToken: 3.8,
        cjkCharsPerToken: 1.5,
      };

    const pricing: Model['pricing'] = {
      input: input_,
      output,
      ...(cachedInput !== undefined ? { cachedInput } : {}),
      ...(override?.pricing?.cacheWrite !== undefined ? { cacheWrite: override.pricing.cacheWrite } : {}),
      ...(override?.pricing?.batchDiscount !== undefined
        ? { batchDiscount: override.pricing.batchDiscount }
        : {}),
      ...(override?.pricing?.intro ? { intro: override.pricing.intro } : {}),
      ...(override?.pricing?.longContext ? { longContext: override.pricing.longContext } : {}),
    };

    // "Last changed" is what the freshness badge should actually show: the day
    // the numbers moved, not the day a job happened to run. So it is carried
    // forward untouched unless this model's own pricing differs from what is
    // published — and "differs" is `pricingChanged`, the same comparison the
    // changelog uses, so the two cannot drift apart.
    //
    // Note what is deliberately absent: a `?? isoDate` fallback. A published
    // row that carries no `lastChanged` (one written before the field existed,
    // say) keeps none. Stamping today on it would assert a change that did not
    // happen, and a date that claims everything moved this morning is worth
    // less than an empty field.
    //
    // Second guard: a number that moves in the same run the *source* moved is a
    // correction, not a vendor repricing. Switching Grok from `docs.x.ai/docs/
    // models` to the real pricing page dropped a cached-input rate from 0.5 to
    // 0.3 — xAI had not touched it; we had simply been reading the wrong page.
    // Suppressing here can hide a genuine same-day move, and that trade is
    // deliberate: on a catalog whose whole claim is provenance, announcing a
    // change nobody made costs more than missing one by a day. The next run
    // reads the same source and catches it.
    const sourceMoved =
      before !== undefined &&
      (before.provenance.source !== source ||
        before.provenance.verifiedUrl !== (override?.verifiedUrl ?? undefined));

    // A model that has just appeared has no prior rate, so nothing moved: it
    // gets no date at all. The old `!before ? isoDate` branch would have put
    // "PRICES CHANGED <today>" on the panel the first time any vendor shipped
    // a model — the same false positive by a different route. `diff.added`
    // already records the arrival, which is the honest way to say it.
    const lastChanged = !before
      ? undefined
      : pricingChanged(before.pricing, pricing) && !sourceMoved
        ? isoDate
        : before.provenance.lastChanged;

    if (before && sourceMoved && pricingChanged(before.pricing, pricing)) {
      corrections.push({ id, from: before.provenance.verifiedUrl, to: override?.verifiedUrl });
    }

    const model: Model = {
      id,
      providerId,
      displayName:
        override?.displayName ??
        before?.displayName ??
        prettyName(feed?.sourceKey ?? id, family?.stripPrefix ?? undefined),
      status: override?.status ?? before?.status ?? 'current',
      contextWindow: override?.contextWindow ?? feed?.contextWindow ?? before?.contextWindow ?? 128_000,
      pricing,
      tokenizer,
      capabilities: override?.capabilities ??
        family?.capabilities ??
        before?.capabilities ?? { reasoning: false, vision: false },
      provenance: {
        source,
        lastVerified: override?.lastVerified ?? isoDate,
        ...(lastChanged ? { lastChanged } : {}),
        ...(override?.verifiedUrl ? { verifiedUrl: override.verifiedUrl } : {}),
        ...(reasons.length > 0
          ? {
              needsReview: true,
              reviewNote: reasons.map((r) => r.text).join('; '),
              reviewCodes: reasons.map((r) => r.code),
            }
          : {}),
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
      review.push({
        id,
        reason: reason.text,
        code: reason.code,
        isNew: !wasAlreadyRaised(before, reason),
      });
    }
  }

  const usedProviders = new Set(models.map((m) => m.providerId));
  const catalog: PricingCatalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    providers: allowlist.providers.filter((p) => usedProviders.has(p.id)),
    models: models.sort((a, b) => a.id.localeCompare(b.id)),
  };

  return { catalog, review, stale: staleIds, corrections };
}

/** Keep an existing note but do not repeat a reason already recorded in it. */
function mergeNote(existing: string | undefined, reason: string): string {
  if (!existing) return reason;
  return existing.includes(reason) ? existing : `${existing}; ${reason}`;
}

/** Union of review codes — order-stable and duplicate-free. */
function mergeCodes(existing: string[] | undefined, incoming: ReviewCode[]): string[] {
  return [...new Set([...(existing ?? []), ...incoming])];
}

/** Strip every figure, so two renderings of the same standing reason compare
 *  equal. Only used for rows published before `reviewCodes` existed. */
function stem(text: string): string {
  return text.replace(/[\d.,$%]+/g, '');
}

/** Has a reason of this kind already been raised against the published row?
 *
 *  Keyed on the code. Rows published before `reviewCodes` existed carry only
 *  the note, so those fall back to comparing the note's *stem* — without that
 *  fallback the first run after this change would re-raise every standing flag
 *  and open exactly the pull request this change exists to prevent. */
function wasAlreadyRaised(before: Model | undefined, reason: Reason): boolean {
  const codes = before?.provenance.reviewCodes;
  if (codes && codes.length > 0) return codes.includes(reason.code);
  return stem(before?.provenance.reviewNote ?? '').includes(stem(reason.text));
}

export function relativeGap(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
