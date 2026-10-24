import { useEffect, useRef, useState } from 'react';
import { ACCENTS, type Accent, type Canvas, type Theme } from '@/state/useAppearance';
import { NAV_LABELS } from '@/lib/links';

export type ViewId = 'estimate' | 'compare' | 'learn' | 'data';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'estimate', label: NAV_LABELS.estimate },
  { id: 'compare', label: NAV_LABELS.compare },
  { id: 'learn', label: NAV_LABELS.learn },
  { id: 'data', label: NAV_LABELS.data },
];

interface HeaderProps {
  /**
   * The calculator view in use, or null on a page that is not the calculator
   * (the Receipt page, the generated pages), where no view is highlighted.
   */
  view: ViewId | null;
  /** The page this header sits on, when it is one of the two linked pages. */
  current?: 'receipt' | 'freeTiers';
  /**
   * The site's base path with its trailing slash (`/` on promptspend.com). A
   * prop rather than an import of `@/config`, which reads `import.meta.env` and
   * so cannot be loaded by the build script that draws this header into the
   * generated pages.
   */
  base: string;
  onView: (view: ViewId) => void;
  /** The day a published rate last actually moved. */
  pricesChangedOn: string | null;
  /** The day the sources were last checked without a problem, if known. */
  sourcesCheckedOn: string | null;
  degraded: boolean;
  /**
   * True while the figures above are not known yet (the Receipt page draws its
   * header before its catalog arrives). The line then holds its height with no
   * words in it, rather than saying "no change recorded", which would be false.
   */
  freshnessLoading?: boolean;
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
  const appHref = `${props.base}app/`;
  const receiptHref = `${props.base}receipt/`;
  const freeTiersHref = `${props.base}free-tiers/`;
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
          <a href={receiptHref} aria-current={props.current === 'receipt' ? 'page' : undefined}>
            {NAV_LABELS.receipt}
          </a>
          <a href={freeTiersHref} aria-current={props.current === 'freeTiers' ? 'page' : undefined}>
            {NAV_LABELS.freeTiers}
          </a>
        </nav>

        <div className="header__spacer" />

        <button type="button" className="kbd-button" onClick={props.onCommandPalette}>
          <span>
            Search <span className="visually-hidden">&amp; commands</span>
          </span>
          <kbd>Ctrl K</kbd>
        </button>

        {/* The permanent way back to the apps once the launch banner has been
            dismissed. Styled as the tour pill and hidden with it on phones,
            where the header is already full and the footer carries the link. */}
        <a className="tour-toggle get-app" href={appHref} title="Get the iPhone and Android apps">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18h3" />
          </svg>
          <span>
            <span className="visually-hidden">Get the</span> Apps
          </span>
        </a>

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
        <div
          className={`freshness${props.degraded ? ' freshness--degraded' : ''}`}
          aria-hidden={props.freshnessLoading ? true : undefined}
        >
          <span className="freshness__dot" />
          <span className="freshness__text">
            {props.freshnessLoading ? (
              <>&nbsp;</>
            ) : (
              <>
                <b>prices last changed</b>{' '}
                {props.pricesChangedOn ?? 'no change recorded since tracking began'}
                {props.sourcesCheckedOn && (
                  <>
                    {' · '}
                    <span className="freshness__checked">
                      {props.degraded ? 'last clean check' : 'sources checked'} {props.sourcesCheckedOn}
                    </span>
                  </>
                )}
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
