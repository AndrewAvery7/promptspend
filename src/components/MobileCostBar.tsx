import { useEffect, useState } from 'react';
import type { ComparisonRow } from '@/lib/engine/cost';
import { formatMoney } from '@/lib/engine/format';
import { jumpTo } from './jumpTo';

/**
 * A slim bar pinned to the bottom of a phone screen: the cheapest selected
 * model's monthly bill, and a way to the full comparison.
 *
 * On a 375px phone the cost cards start almost five screens below the hero,
 * under the model list, the workload and the scale panels. Every slider a
 * visitor moves up there changes a number they cannot see. This keeps the one
 * number that matters most in view while they work, and one tap from the rest.
 *
 * Phones only: the CSS hides it above the site's 760px layout breakpoint,
 * where the results column already sits beside the inputs (sticky from
 * 1021px). It renders nothing at all when no model is selected — "$0/mo"
 * would be a number about nothing — and steps aside while the results panel
 * itself is on screen, where it would only repeat what is directly above it.
 *
 * The figure is `rows[0].scaled.perMonth`, read from the same rows the cost
 * cards render (sorted cheapest first by `useEstimator`). It is not re-derived
 * here, so the bar and the card can never disagree.
 *
 * Not an `aria-live` region on purpose: the number changes on every slider
 * step, and announcing each one would drown out the slider's own value.
 */
interface MobileCostBarProps {
  rows: readonly ComparisonRow[];
  /** The element whose visibility hides the bar (the results column). */
  resultsId: string;
  /** Where "See all costs" sends focus: a focusable heading inside it. */
  targetId: string;
}

/** Added to <body> while the bar shows, so CSS can pad the page bottom. */
const BODY_CLASS = 'has-mobile-cost-bar';

export function MobileCostBar({ rows, resultsId, targetId }: MobileCostBarProps) {
  const [resultsOnScreen, setResultsOnScreen] = useState(false);

  useEffect(() => {
    const results = document.getElementById(resultsId);
    // No observer (an old browser, or jsdom): the bar simply stays. Showing a
    // correct number slightly too often beats never showing it.
    if (!results || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setResultsOnScreen(entry.isIntersecting);
    });
    observer.observe(results);
    return () => observer.disconnect();
  }, [resultsId]);

  const cheapest = rows[0];
  const visible = cheapest !== undefined && !resultsOnScreen;

  // The page needs bottom padding while the bar covers the bottom of the
  // window, or the last line of the footer sits permanently underneath it. A
  // class on <body> rather than a spacer element, because the bar lives inside
  // the estimator and the thing it would cover is the site footer outside it.
  // The padding itself is in a phone-width media query, so this is inert on a
  // desktop where the bar is hidden.
  useEffect(() => {
    if (!visible) return;
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="mobile-cost-bar" role="region" aria-label="Cheapest selected model, monthly cost">
      <p className="mobile-cost-bar__text">
        {/* The name is the part that can be long ("Gemini 3.1 Flash-Lite
            Preview…"), so it is the part that gives way: it truncates with an
            ellipsis and the price beside it never does. Long unbreakable text
            widening the page on a phone is a bug this site has shipped before. */}
        <span className="mobile-cost-bar__label">Cheapest</span>
        <span className="mobile-cost-bar__name" title={cheapest.model.displayName}>
          {cheapest.model.displayName}
        </span>
        <span className="mobile-cost-bar__price mono">{formatMoney(cheapest.scaled.perMonth)}/mo</span>
      </p>
      <button
        type="button"
        className="button button--primary mobile-cost-bar__button"
        onClick={() => jumpTo(targetId)}
      >
        See all costs
      </button>
    </div>
  );
}
