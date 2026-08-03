import { useEffect, useRef, useState } from 'react';
import { ACCENTS, type Accent, type Canvas, type Theme } from '@/state/useAppearance';

export type ViewId = 'estimate' | 'compare' | 'learn' | 'data';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'estimate', label: 'Estimate' },
  { id: 'compare', label: 'Compare' },
  { id: 'learn', label: 'Learn' },
  { id: 'data', label: 'Data & Alerts' },
];

interface HeaderProps {
  view: ViewId;
  onView: (view: ViewId) => void;
  /** The day a published rate last actually moved. */
  pricesChangedOn: string | null;
  /** The day the sources were last checked without a problem, if known. */
  sourcesCheckedOn: string | null;
  degraded: boolean;
  tourActive: boolean;
  tourPulse: boolean;
  onTour: () => void;
  onCommandPalette: () => void;
  theme: Theme;
  accent: Accent;
  canvas: Canvas;
  onTheme: () => void;
  onAccent: (accent: Accent) => void;
  onCanvas: (canvas: Canvas) => void;
}

export function Header(props: HeaderProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!paletteRef.current?.contains(event.target as Node)) setPaletteOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [paletteOpen]);

  return (
    <header className="header">
      <div className="header__inner">
        <div className="logo">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect
              x="1.5"
              y="1.5"
              width="23"
              height="23"
              rx="6"
              stroke="currentColor"
              strokeWidth="2"
              className="logo__mark"
            />
            <path
              d="M7 9.5h12M7 13.5h8M7 17.5h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="logo__mark"
            />
          </svg>
          <span>
            Prompt<span className="logo__mark">Spend</span>
          </span>
        </div>

        <nav className="nav" aria-label="Main">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => props.onView(view.id)}
              aria-current={props.view === view.id ? 'page' : undefined}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="header__spacer" />

        <button type="button" className="kbd-button" onClick={props.onCommandPalette}>
          <span>Search &amp; commands</span>
          <kbd>Ctrl K</kbd>
        </button>

        <button
          type="button"
          className={`tour-toggle${props.tourActive ? ' tour-toggle--on' : ''}${
            props.tourPulse ? ' tour-toggle--pulse' : ''
          }`}
          aria-pressed={props.tourActive}
          onClick={props.onTour}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 11l18-8-8 18-2.5-7.5L3 11z" />
          </svg>
          Guided tour
        </button>

        {/* Two different facts, deliberately shown as two.
            "Prices last changed" is a property of the market; "sources checked"
            is a property of our pipeline. A single "synced" date conflated them,
            so a week of stable prices looked identical to a broken cron job. */}
        <div className={`freshness${props.degraded ? ' freshness--degraded' : ''}`}>
          <span className="freshness__dot" />
          <span className="freshness__text">
            <b>prices last changed</b> {props.pricesChangedOn ?? 'not yet recorded'}
            {props.sourcesCheckedOn && (
              <>
                {' · '}
                <span className="freshness__checked">
                  {props.degraded ? 'last clean check' : 'sources checked'} {props.sourcesCheckedOn}
                </span>
              </>
            )}
          </span>
        </div>

        <div className="palette" ref={paletteRef}>
          <button
            type="button"
            className="icon-button"
            aria-label="Appearance options"
            aria-expanded={paletteOpen}
            onClick={() => setPaletteOpen((open) => !open)}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2.7s6.5 7.1 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 9.8 12 2.7 12 2.7z" />
            </svg>
          </button>
          {paletteOpen && (
            <div className="palette__pop" role="group" aria-label="Appearance">
              <div className="palette__row">
                <span className="palette__label">Accent</span>
                {ACCENTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="swatch"
                    style={{ background: option.swatch }}
                    title={option.label}
                    aria-label={`${option.label} accent`}
                    aria-pressed={props.accent === option.id}
                    onClick={() => props.onAccent(option.id)}
                  />
                ))}
              </div>
              <div className="palette__row">
                <span className="palette__label">Canvas</span>
                <button
                  type="button"
                  className="canvas-chip"
                  aria-pressed={props.canvas === 'cool'}
                  onClick={() => props.onCanvas('cool')}
                >
                  <i style={{ background: '#EBEFF5' }} />
                  Cool
                </button>
                <button
                  type="button"
                  className="canvas-chip"
                  aria-pressed={props.canvas === 'warm'}
                  onClick={() => props.onCanvas('warm')}
                >
                  <i style={{ background: '#F5F1E8' }} />
                  Warm
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-button"
          aria-label={props.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          onClick={props.onTheme}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
