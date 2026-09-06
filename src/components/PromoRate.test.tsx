import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Model } from '@/lib/pricing/types';
import { promoFor, promoTitle, rateOn } from '@/lib/pricing/promo';
import { effectivePricing } from '@/lib/engine/cost';
import { Rate } from './PromoRate';

const DURING = new Date('2026-08-15T12:00:00Z');
const AFTER = new Date('2027-01-01T00:00:00Z');

function model(overrides: Partial<Model['pricing']> = {}): Model {
  return {
    id: 'promo',
    providerId: 'google',
    displayName: 'Promo Flash',
    status: 'current',
    contextWindow: 1_000_000,
    pricing: {
      input: 1.5,
      output: 7.5,
      cachedInput: 0.15,
      cacheWrite: 1.875,
      intro: { input: 0.75, output: 3.75, cachedInput: 0.075, until: '2026-12-31' },
      ...overrides,
    },
    tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 1.6 },
    capabilities: { reasoning: true, vision: true },
    provenance: { source: 'vendor', lastVerified: '2026-08-01', verifiedUrl: 'https://example.test/' },
  };
}

/** What a sighted reader sees: the text with the screen-reader sentence removed. */
function visible(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('.visually-hidden')) hidden.remove();
  return clone.textContent ?? '';
}

describe('Rate', () => {
  it('prints the promotional figure with a marked, explained tooltip while the promotion runs', () => {
    const { container, getByTitle } = render(
      <Rate model={model()} field="input" asOf={DURING} suffix="/M" />,
    );

    // The figure the reader is billed at today, not the catalog's standard
    // rate — which appears only inside the marker's explanation.
    expect(visible(container)).toBe('$0.75/M');

    const marker = getByTitle('Promotional rate until 2026-12-31 — standard rate $1.5/M');
    expect(marker).toHaveClass('rate-promo');
    // The glyph is decoration; the sentence reaches a screen reader as text.
    expect(marker.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(marker.querySelector('.visually-hidden')?.textContent).toContain('standard rate $1.5/M');
  });

  it('falls back to the standard figure, unmarked, once the promotion has expired', () => {
    const { container } = render(<Rate model={model()} field="output" asOf={AFTER} suffix="/M" />);

    expect(container.textContent).toBe('$7.5/M');
    expect(container.querySelector('.rate-promo')).toBeNull();
  });

  it('marks nothing on a model that has no promotion', () => {
    const { container } = render(<Rate model={model({ intro: undefined })} field="input" asOf={DURING} />);

    expect(container.textContent).toBe('$1.5');
    expect(container.querySelector('.rate-promo')).toBeNull();
  });

  it('honours the whole of the last promotional day, exactly as the engine does', () => {
    // Off by a day here would show a standard rate while the engine was still
    // charging the promotional one — two numbers on one page for one model.
    const lastMoment = new Date('2026-12-31T23:59:59.999Z');
    const { container } = render(<Rate model={model()} field="input" asOf={lastMoment} />);
    expect(visible(container)).toBe('$0.75');
    expect(container.querySelector('.rate-promo')).not.toBeNull();
  });
});

describe('promoFor', () => {
  it('marks a cache rate only when the vendor published a promotional figure for it', () => {
    const m = model();
    const effective = effectivePricing(m.pricing, DURING);

    expect(promoFor(m.pricing, effective, 'cachedInput')).toEqual({ until: '2026-12-31', standard: 0.15 });
    // No intro.cacheWrite, so the standard write rate stands and there is
    // nothing to explain.
    expect(promoFor(m.pricing, effective, 'cacheWrite')).toBeNull();
  });

  it('returns null for every field once the window has closed', () => {
    const m = model();
    const effective = effectivePricing(m.pricing, AFTER);
    for (const field of ['input', 'output', 'cachedInput', 'cacheWrite'] as const) {
      expect(promoFor(m.pricing, effective, field)).toBeNull();
    }
  });

  it('agrees with rateOn about both the figure and the promotion', () => {
    expect(rateOn(model(), 'input', DURING)).toEqual({
      value: 0.75,
      promo: { until: '2026-12-31', standard: 1.5 },
    });
    expect(rateOn(model(), 'input', AFTER)).toEqual({ value: 1.5, promo: null });
  });

  it('phrases the tooltip with the expiry and the standard rate', () => {
    expect(promoTitle({ until: '2026-12-31', standard: 1.5 })).toBe(
      'Promotional rate until 2026-12-31 — standard rate $1.5/M',
    );
  });
});
