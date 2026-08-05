import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Catalog, loadCatalog } from '@/lib/pricing/catalog';
import {
  COMPARE_INDEX_URL,
  CONTACT_EMAIL,
  DEVELOPER_HUB_URL,
  HEALTH_URL,
  MCP_PACKAGE_URL,
  MODELS_INDEX_URL,
  OPEN_VSX_URL,
  PRICING_URL,
  PROVIDERS_INDEX_URL,
  REPO_URL,
  VSCODE_MARKETPLACE_URL,
} from '@/config';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAppearance, ACCENTS } from '@/state/useAppearance';
import { useEstimator } from '@/state/useEstimator';
import { Header, VIEWS, type ViewId } from '@/components/Header';
import { Ticker } from '@/components/Ticker';
import { EstimateView } from '@/components/EstimateView';
import { CompareView } from '@/components/CompareView';
import { LearnView } from '@/components/LearnView';
import { DataView } from '@/components/DataView';
import { GuidedTour, TOUR_STEPS } from '@/components/GuidedTour';
import { CommandPalette, type Command } from '@/components/CommandPalette';

const WELCOME_KEY = 'ps.welcomeDismissed';

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCatalog(PRICING_URL, HEALTH_URL)
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="state-message">
        <h1>Pricing data could not be loaded</h1>
        <p>{error}</p>
        <p>
          The catalog is a static file in the repository — if this persists, please{' '}
          <a href={`${REPO_URL}/issues/new`}>open an issue</a>.
        </p>
      </main>
    );
  }

  if (!catalog) {
    return (
      <main className="state-message" aria-live="polite">
        Loading today&apos;s prices…
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <Workspace catalog={catalog} />
    </ErrorBoundary>
  );
}

function Workspace({ catalog }: { catalog: Catalog }) {
  const appearance = useAppearance();
  const estimator = useEstimator(catalog);
  // An emailed preferences link lands on `/?alerts=<token>`, and the panel that
  // reads it lives in Data & Alerts. Landing on Estimate meant the link
  // appeared to do nothing at all.
  const [view, setView] = useState<ViewId>(() =>
    new URLSearchParams(window.location.search).has('alerts') ? 'data' : 'estimate',
  );
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  /**
   * An id to scroll to once the view holding it has rendered.
   *
   * Switching view and scrolling cannot happen in the same statement: the target
   * lives in a component that has not mounted yet, so `getElementById` returns
   * null. The id is parked here and read by the effect below, which runs after
   * React commits the new view — the first moment the element exists.
   *
   * A ref rather than state, and keyed on `view` rather than on itself: clearing
   * state from inside the effect that reads it is an extra render and a
   * `set-state-in-effect` lint error, and the value is never rendered.
   */
  const scrollTarget = useRef<string | null>(null);

  useEffect(() => {
    const id = scrollTarget.current;
    if (id === null) return;
    scrollTarget.current = null;
    const target = document.getElementById(id);
    if (!target) return;

    // Focus as well as scroll. Scrolling alone leaves a keyboard user's focus on
    // the link they just used — now off screen — and their next Tab carries on
    // from somewhere they cannot see. `preventScroll` because the smooth scroll
    // below owns the movement; without it the browser jumps there first.
    target.focus({ preventScroll: true });

    // The same rule the guided tour follows: `prefers-reduced-motion` has to be
    // honoured in JavaScript too, since no CSS rule reaches `scrollIntoView`.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [view]);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) === '1';
    } catch {
      return false;
    }
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const startTour = useCallback(() => {
    dismissWelcome();
    setView('estimate');
    setTourStep(0);
  }, [dismissWelcome]);

  const stopTour = useCallback(() => setTourStep(null), []);

  // Ctrl/Cmd-K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = VIEWS.map((entry) => ({
      id: `view-${entry.id}`,
      label: `Go to ${entry.label}`,
      kind: 'view',
      run: () => setView(entry.id),
    }));

    list.push(
      {
        id: 'tour',
        label: tourStep === null ? 'Start the guided tour' : 'Stop the guided tour',
        kind: 'tour',
        run: () => (tourStep === null ? startTour() : stopTour()),
      },
      {
        id: 'theme',
        label: appearance.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
        kind: 'theme',
        run: appearance.toggleTheme,
      },
      {
        id: 'reset',
        label: 'Reset the scenario',
        kind: 'scenario',
        run: () => {
          estimator.reset();
          showToast('Scenario reset');
        },
      },
      {
        id: 'canvas-cool',
        label: 'Canvas: cool paper',
        kind: 'colour',
        run: () => appearance.setCanvas('cool'),
      },
      {
        id: 'canvas-warm',
        label: 'Canvas: warm cream',
        kind: 'colour',
        run: () => appearance.setCanvas('warm'),
      },
    );

    for (const accent of ACCENTS) {
      list.push({
        id: `accent-${accent.id}`,
        label: `Accent: ${accent.label}`,
        kind: 'colour',
        run: () => appearance.setAccent(accent.id),
      });
    }

    for (const model of catalog.primaryModels) {
      const selected = estimator.scenario.modelIds.includes(model.id);
      list.push({
        id: `model-${model.id}`,
        label: `${selected ? 'Remove' : 'Add'} ${model.displayName}`,
        kind: catalog.providerName(model),
        run: () => {
          const result = estimator.toggleModel(model.id);
          if (!result.ok && result.reason) showToast(result.reason);
          else setView('estimate');
        },
      });
    }

    return list;
  }, [catalog, estimator, appearance, tourStep, startTour, stopTour, showToast]);

  return (
    <>
      <Ticker catalog={catalog} />
      <Header
        view={view}
        onView={setView}
        pricesChangedOn={catalog.pricesLastChanged()}
        sourcesCheckedOn={catalog.sourcesLastChecked()}
        degraded={catalog.health?.outcome === 'degraded'}
        tourActive={tourStep !== null}
        tourPulse={!welcomeDismissed && tourStep === null}
        onTour={() => (tourStep === null ? startTour() : stopTour())}
        onCommandPalette={() => setPaletteOpen(true)}
        theme={appearance.theme}
        accent={appearance.accent}
        canvas={appearance.canvas}
        onTheme={appearance.toggleTheme}
        onAccent={appearance.setAccent}
        onCanvas={appearance.setCanvas}
      />

      <main className="main">
        {view === 'estimate' && (
          <EstimateView
            catalog={catalog}
            estimator={estimator}
            search={search}
            onSearch={setSearch}
            onToast={showToast}
            showWelcome={!welcomeDismissed}
            onStartTour={startTour}
            onDismissWelcome={dismissWelcome}
            onOpenData={() => {
              scrollTarget.current = 'build-title';
              setView('data');
            }}
          />
        )}
        {view === 'compare' && (
          <CompareView
            catalog={catalog}
            selectedIds={estimator.scenario.modelIds}
            rows={estimator.rows}
            conversationsPerDay={estimator.scenario.conversationsPerDay}
            onOpenEstimate={() => setView('estimate')}
            onToggle={(id) => {
              const result = estimator.toggleModel(id);
              if (!result.ok && result.reason) showToast(result.reason);
            }}
          />
        )}
        {view === 'learn' && <LearnView catalog={catalog} />}
        {view === 'data' && <DataView catalog={catalog} theme={appearance.theme} onToast={showToast} />}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div>
            <b>PromptSpend</b> · open source, MIT · no accounts, no tracking ·{' '}
            <a href={REPO_URL}>star it on GitHub</a> · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          {/* The generated pages. Every model has a permanent URL of its own —
              useful to link to, and the route by which anything that does not
              run JavaScript can read this catalog at all. */}
          <div>
            <a href={MODELS_INDEX_URL}>All model prices</a> · <a href={PROVIDERS_INDEX_URL}>By provider</a> ·{' '}
            <a href={COMPARE_INDEX_URL}>Comparisons</a> · <a href={DEVELOPER_HUB_URL}>Pricing API</a>
          </div>
          {/* The three places this catalog answers that are not a web page. The
              footer is the only row present on every view, so it is where
              somebody who never opens Data & Alerts finds out they exist. */}
          <div>
            <a href={MCP_PACKAGE_URL} target="_blank" rel="noreferrer noopener">
              MCP server
            </a>{' '}
            ·{' '}
            <a href={VSCODE_MARKETPLACE_URL} target="_blank" rel="noreferrer noopener">
              VS Code extension
            </a>{' '}
            ·{' '}
            <a href={OPEN_VSX_URL} target="_blank" rel="noreferrer noopener">
              Open VSX
            </a>
          </div>
          <div className="mono">
            {catalog.primaryModels.length} models · prices last changed{' '}
            {catalog.pricesLastChanged() ?? 'not yet recorded'}
            {catalog.sourcesLastChecked() ? ` · sources checked ${catalog.sourcesLastChecked()}` : ''}
          </div>
        </div>
      </footer>

      {tourStep !== null && (
        <GuidedTour
          step={Math.min(tourStep, TOUR_STEPS.length - 1)}
          onStep={(next) => setTourStep(Math.max(0, Math.min(next, TOUR_STEPS.length - 1)))}
          onFinish={stopTour}
        />
      )}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
