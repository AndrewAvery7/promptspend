import { useMemo } from 'react';
import type { Model } from '@/lib/pricing/types';
import { promoTitle, rateOn, type Promo, type RateField } from '@/lib/pricing/promo';
import { formatRate } from '@/lib/engine/format';

/**
 * The moment the page decides which rates are in force.
 *
 * Taken once per view rather than per cell, so every figure on the screen is
 * answering the same question — and so a promotion ending at midnight cannot
 * flip half a table while the other half is still being rendered. The engine
 * takes its own `new Date()` per calculation; the two can only disagree in
 * the second a promotion expires, which is a disagreement worth having.
 */
export function useAsOf(): Date {
  return useMemo(() => new Date(), []);
}

interface PromoIconProps {
  promo: Promo;
}

/**
 * The marker beside a promotional figure.
 *
 * A native `title` for anyone with a pointer, and the same sentence as
 * visually-hidden text for anyone without one — a `title` alone is read by
 * no screen reader worth naming. The glyph itself is decoration.
 */
export function PromoIcon({ promo }: PromoIconProps) {
  const title = promoTitle(promo);
  return (
    <span className="rate-promo" title={title}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M3 3h8l10 10-8 8L3 11z" />
        <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
      </svg>
      <span className="visually-hidden"> ({title})</span>
    </span>
  );
}

interface RateProps {
  model: Model;
  field: Extract<RateField, 'input' | 'output'>;
  asOf: Date;
  /** Printed directly after the figure, before the marker — `/M`, say. */
  suffix?: string;
}

/**
 * One per-million rate, as the reader is actually billed for it today.
 *
 * Prints the promotional figure while a promotion runs and the standard one
 * otherwise, and marks the former. Views used to print `model.pricing.input`
 * straight from the catalog, which is the standard rate whatever the vendor
 * is charging this month.
 */
export function Rate({ model, field, asOf, suffix = '' }: RateProps) {
  const { value, promo } = rateOn(model, field, asOf);
  return (
    <>
      {formatRate(value ?? model.pricing[field])}
      {suffix}
      {promo && <PromoIcon promo={promo} />}
    </>
  );
}
