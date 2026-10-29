import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandPalette, type Command } from '@/components/CommandPalette';
import { Header, VIEWS, type ViewId } from '@/components/Header';
import { ACCENTS, type useAppearance } from '@/state/useAppearance';
import { loadCatalog, type Catalog } from '@/lib/pricing/catalog';
import { modelSlug } from '@/lib/seo/slug';
import { NAV_LABELS } from '@/lib/links';

/**
 * The calculator's header for every page that is not the calculator: the
 * Receipt page and, through `src/chrome/site-header.tsx`, the generated pages.
 *
 * It is the very same `Header` the calculator draws - logo, six links, search,
 * Apps, Guided tour, accent and canvas picker, dark mode and the freshness line -
 * with the pieces that belong to the calculator's own state replaced by ways
 * into it. A view is a link to `/#compare` and the others; the tour is
 * `/#tour`, which the calculator reads on arrival; the search palette offers
 * those same destinations, the site's pages and every model's page.
 *
 * The appearance comes in as a prop, because the page already owns one
 * `useAppearance` and a second would keep its own idea of the theme.
 */

export interface SiteHeaderProps {
  /** Site base path with its trailing slash. */
  base: string;
  current?: 'receipt' | 'freeTiers';
  appearance: ReturnType<typeof useAppearance>;
  /** Null while unknown; the line is then drawn empty rather than wrong. */
  freshness: { pricesChangedOn: string | null; sourcesCheckedOn: string | null; degraded: boolean } | null;
  /** A catalog the page already holds. Without one, the palette reads its own on first use. */
  catalog?: Catalog | null;
}

export function SiteHeader({ base, current, appearance, freshness, catalog }: SiteHeaderProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [fetched, setFetched] = useState<Catalog | null>(null);
  const models = catalog ?? fetched;

  // The palette needs the model list, and the generated pages do not carry it.
  // Read it the first time the palette opens, not on every page view.
  useEffect(() => {
    if (!paletteOpen || catalog || fetched) return;
    let cancelled = false;
    loadCatalog(`${base}data/pricing.json`)
      .then((loaded) => {
        if (!cancelled) setFetched(loaded);
      })
      .catch(() => {
        /* the palette still offers everything but the model pages */
      });
    return () => {
      cancelled = true;
    };
  }, [paletteOpen, catalog, fetched, base]);

  // Ctrl/Cmd-K opens the palette from anywhere, as it does in the calculator.
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

  const goTo = useCallback((path: string) => window.location.assign(`${base}${path}`), [base]);
  const goToView = useCallback((view: ViewId) => goTo(view === 'estimate' ? '' : `#${view}`), [goTo]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = VIEWS.map((entry) => ({
      id: `view-${entry.id}`,
      label: `Go to ${entry.label}`,
      kind: 'view',
      run: () => goToView(entry.id),
    }));
    list.push(
      { id: 'tour', label: 'Start the guided tour', kind: 'tour', run: () => goTo('#tour') },
      {
        id: 'theme',
        label: appearance.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
        kind: 'theme',
        run: appearance.toggleTheme,
      },
      {
        id: 'free-tiers',
        label: 'Compare free tiers: which providers let you start free',
        kind: 'page',
        run: () => goTo('free-tiers/'),
      },
      { id: 'receipt', label: `Open ${NAV_LABELS.receipt}`, kind: 'page', run: () => goTo('receipt/') },
      { id: 'models', label: 'Every model, by price', kind: 'page', run: () => goTo('models/') },
      { id: 'providers', label: 'Prices by provider', kind: 'page', run: () => goTo('providers/') },
      { id: 'compare-pages', label: 'Head-to-head comparisons', kind: 'page', run: () => goTo('compare/') },
      { id: 'apps', label: 'Get the iPhone and Android apps', kind: 'page', run: () => goTo('app/') },
      {
        id: 'canvas-cool',
        label: 'Canvas: cool paper',
        kind: 'color',
        run: () => appearance.setCanvas('cool'),
      },
      {
        id: 'canvas-warm',
        label: 'Canvas: warm cream',
        kind: 'color',
        run: () => appearance.setCanvas('warm'),
      },
    );
    for (const accent of ACCENTS) {
      list.push({
        id: `accent-${accent.id}`,
        label: `Accent: ${accent.label}`,
        kind: 'color',
        run: () => appearance.setAccent(accent.id),
      });
    }
    if (models) {
      for (const model of models.selectableModels) {
        list.push({
          id: `model-${model.id}`,
          label: `${model.displayName}: price page`,
          kind: models.providerName(model),
          run: () => goTo(`models/${modelSlug(model.id)}/`),
        });
      }
    }
    return list;
  }, [appearance, goTo, goToView, models]);

  return (
    <>
      <Header
        base={base}
        view={null}
        current={current}
        onView={goToView}
        pricesChangedOn={freshness?.pricesChangedOn ?? null}
        sourcesCheckedOn={freshness?.sourcesCheckedOn ?? null}
        degraded={freshness?.degraded ?? false}
        freshnessLoading={freshness === null}
        tourActive={false}
        tourPulse={false}
        onTour={() => goTo('#tour')}
        onCommandPalette={() => setPaletteOpen(true)}
        theme={appearance.theme}
        accent={appearance.accent}
        canvas={appearance.canvas}
        onTheme={appearance.toggleTheme}
        onAccent={appearance.setAccent}
        onCanvas={appearance.setCanvas}
      />
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </>
  );
}
