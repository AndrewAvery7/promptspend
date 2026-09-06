/**
 * Which rate cells are promotional, and what their tooltip should say.
 *
 * The date arithmetic lives in `effectivePricing` and nowhere else; this
 * module only reads its result. It is shared by the React views and the
 * static SEO renderer so both surfaces mark the same cells for the same
 * reasons — the site has a tiny INTRO badge beside a model's name, but the
 * figure itself was printed at the standard rate, which is the number that
 * gets copied into a budget.
 */

import type { Model, Pricing } from './types';
import { effectivePricing } from '../engine/cost';
import { formatRate } from '../engine/format';

export type RateField = 'input' | 'output' | 'cachedInput' | 'cacheWrite';

export interface Promo {
  /** Last day (YYYY-MM-DD, inclusive) the promotional rate is in force. */
  until: string;
  /** The published standard rate the promotion replaces, USD per 1M tokens. */
  standard: number;
}

/**
 * The promotion behind one rate cell, or null when the cell is standard.
 *
 * `effective` must be what `effectivePricing` returned for `pricing`: it hands
 * back the very same object when no promotion is in force, which is the test
 * used here — the same one the page model uses for its `promotional` flag.
 * Cache rates only count when the vendor published a promotional figure for
 * them; otherwise the standard rate stands and there is nothing to mark.
 */
export function promoFor(pricing: Pricing, effective: Pricing, field: RateField): Promo | null {
  const intro = pricing.intro;
  if (!intro || effective === pricing) return null;
  const standard = pricing[field];
  if (intro[field] === undefined || standard === undefined) return null;
  return { until: intro.until, standard };
}

/** The figure in force on `asOf` for one field, with its promotion if any. */
export function rateOn(
  model: Model,
  field: RateField,
  asOf: Date,
): { value: number | undefined; promo: Promo | null } {
  const effective = effectivePricing(model.pricing, asOf);
  return { value: effective[field], promo: promoFor(model.pricing, effective, field) };
}

/** The tooltip and screen-reader text for a promotional cell. */
export function promoTitle(promo: Promo): string {
  return `Promotional rate until ${promo.until} — standard rate ${formatRate(promo.standard)}/M`;
}
