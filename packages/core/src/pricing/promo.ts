import { effectivePricing } from '../engine/cost';
import { formatRate } from '../engine/format';
import type { Model, Pricing } from './types';

export type RateField = 'input' | 'output' | 'cachedInput' | 'cacheWrite';
export interface Promo {
  until: string;
  standard: number;
}

export function promoFor(pricing: Pricing, effective: Pricing, field: RateField): Promo | null {
  const intro = pricing.intro;
  if (!intro || effective === pricing) return null;
  const standard = pricing[field];
  if (intro[field] === undefined || standard === undefined) return null;
  return { until: intro.until, standard };
}

export function rateOn(
  model: Model,
  field: RateField,
  asOf: Date,
): { value: number | undefined; promo: Promo | null } {
  const effective = effectivePricing(model.pricing, asOf);
  return { value: effective[field], promo: promoFor(model.pricing, effective, field) };
}

export function promoTitle(promo: Promo): string {
  return `Promotional rate until ${promo.until} — standard rate ${formatRate(promo.standard)}/M`;
}
