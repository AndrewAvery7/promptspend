import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComparisonRow } from '@/lib/engine/cost';
import { formatMoney } from '@/lib/engine/format';
import { MobileCostBar } from './MobileCostBar';

/**
 * A stand-in observer the test can drive: jsdom has no layout, so nothing would
 * ever intersect on its own. `fire` plays the browser reporting the results
 * column scrolling into or out of view.
 */
let observerCallback: IntersectionObserverCallback | null = null;
class FakeObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const fire = (isIntersecting: boolean) =>
  act(() => {
    observerCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });

/** Only the fields the bar reads; the rest of a row is irrelevant to it. */
const row = (displayName: string, perMonth: number) =>
  ({ model: { id: displayName, displayName }, scaled: { perMonth } }) as unknown as ComparisonRow;

function Page({ rows }: { rows: ComparisonRow[] }) {
  return (
    <>
      <div id="results">
        <h2 id="results-title" tabIndex={-1}>
          Your models, side by side
        </h2>
      </div>
      <MobileCostBar rows={rows} resultsId="results" targetId="results-title" />
    </>
  );
}

beforeEach(() => {
  observerCallback = null;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.classList.remove('has-mobile-cost-bar');
});

describe('MobileCostBar', () => {
  it("shows the cheapest row's monthly cost, under an accessible name", () => {
    // Rows arrive sorted cheapest first from useEstimator; the bar trusts that.
    render(<Page rows={[row('Cheap Model', 12.5), row('Dear Model', 900)]} />);
    const bar = screen.getByRole('region', { name: /cheapest selected model, monthly cost/i });
    expect(bar).toHaveTextContent('Cheap Model');
    expect(bar).toHaveTextContent(`${formatMoney(12.5)}/mo`);
    expect(bar).not.toHaveTextContent('Dear Model');
    expect(document.body).toHaveClass('has-mobile-cost-bar');
  });

  it('renders nothing, and pads nothing, when no model is selected', () => {
    render(<Page rows={[]} />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.body).not.toHaveClass('has-mobile-cost-bar');
  });

  it('steps aside while the results are on screen, and returns when they leave', () => {
    render(<Page rows={[row('Cheap Model', 1)]} />);
    expect(screen.getByRole('region')).toBeInTheDocument();

    fire(true);
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.body).not.toHaveClass('has-mobile-cost-bar');

    fire(false);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('"See all costs" moves focus to the results heading', async () => {
    const user = userEvent.setup();
    render(<Page rows={[row('Cheap Model', 1)]} />);
    await user.click(screen.getByRole('button', { name: 'See all costs' }));
    expect(screen.getByRole('heading', { name: 'Your models, side by side' })).toHaveFocus();
  });

  // The truncation itself is CSS and jsdom has no layout; what can be checked
  // is that the full name is still available when the visible one is clipped.
  it('keeps a long model name available in full', () => {
    const long = 'An Extremely Long Model Name That Would Never Fit On A Phone (Preview, 2026-11)';
    render(<Page rows={[row(long, 3)]} />);
    expect(screen.getByTitle(long)).toHaveClass('mobile-cost-bar__name');
  });
});
