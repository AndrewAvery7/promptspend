import { useEffect, useRef } from 'react';

export interface TourStep {
  title: string;
  body: string;
  /** id of the element to highlight and scroll into view. */
  target: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Choose your models',
    body: 'Pick up to four. Every pick gets its own cost card on the right — the spread between the cheapest and priciest is usually far bigger than people expect.',
    target: 'panel-models',
  },
  {
    title: 'Sliders or your real prompt — your choice',
    body: 'Drag the sliders to sketch rough sizes, or switch a field to “Paste text” and drop in your actual prompt. Counts and costs update as you type.',
    target: 'panel-workload',
  },
  {
    title: 'Mind the response length',
    body: 'Output tokens cost three to five times what input costs on most models. Long answers, not long prompts, are what blow up a bill.',
    target: 'panel-workload',
  },
  {
    title: 'Conversations compound',
    body: 'Every turn re-sends the history as input. Raise the turn count and watch the cost climb faster than a straight line.',
    target: 'panel-workload',
  },
  {
    title: 'Project to your real scale',
    body: 'A few thousand conversations a day sounds small. The per-year figure on each card is the number your finance team will ask about.',
    target: 'panel-scale',
  },
  {
    title: 'Read the cards side by side',
    body: 'Same workload, every model: monthly, yearly, cost per user and margin. The green card is cheapest, and the note underneath says what switching would save.',
    target: 'panel-results',
  },
];

interface GuidedTourProps {
  step: number;
  onStep: (step: number) => void;
  onFinish: () => void;
}

/**
 * A floating step card. It stays fixed at the bottom of the viewport so it is
 * always readable while the step's target panel is scrolled into view.
 */
export function GuidedTour({ step, onStep, onFinish }: GuidedTourProps) {
  const current = TOUR_STEPS[step];
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.classList.add('tour-active');
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      document.body.classList.remove('tour-active');
      document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'));
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'));
    if (!current) return;
    const target = document.getElementById(current.target);
    if (!target) return;
    target.classList.add('tour-highlight');
    // `prefers-reduced-motion` has to be honoured in JavaScript too: a CSS rule
    // cannot reach a smooth scroll requested from script, and a full-page glide
    // is exactly the motion the setting exists to prevent.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onFinish();
        return;
      }
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      // Arrow keys belong to whatever has focus. Sliders, number inputs and
      // text fields all use them, and stealing those made the tour actively
      // hostile to the panel it was pointing at.
      const active = document.activeElement;
      const insideCard = cardRef.current?.contains(active) ?? false;
      const onAControl =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (onAControl && !insideCard) return;

      if (event.key === 'ArrowRight') onStep(Math.min(step + 1, TOUR_STEPS.length - 1));
      else onStep(Math.max(step - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, onStep, onFinish]);

  if (!current) return null;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <aside className="tour-card" role="status" aria-live="polite" ref={cardRef}>
      <span className="tour-card__step">
        STEP {step + 1} / {TOUR_STEPS.length}
      </span>
      <div className="tour-card__body">
        <b>{current.title}</b>
        <span>{current.body}</span>
      </div>
      <div className="tour-card__nav">
        <button type="button" onClick={() => onStep(step - 1)} disabled={step === 0}>
          Back
        </button>
        <button type="button" className="primary" onClick={() => (isLast ? onFinish() : onStep(step + 1))}>
          {isLast ? 'Finish' : 'Next'}
        </button>
      </div>
    </aside>
  );
}
