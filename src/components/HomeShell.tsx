import type { Catalog } from '@/lib/pricing/catalog';
import { EstimateHero } from './EstimateHero';
import { Header } from './Header';
import { Ticker } from './Ticker';

/**
 * The top of the homepage as the build draws it: the price tape, the header
 * and the estimator's hero, exactly as the app's first full render places them.
 *
 * Why (Page speed, November 2026): the homepage is drawn by script, so on
 * Google's phone test its headline waited for the app's code and the price
 * list, 2.7-3.0 s against a 2.5 s budget, while every pre-built page painted at
 * 0.9 s. `scripts/build-chrome-data.ts` renders this to HTML, `vite.config.ts`
 * writes it into index.html's #root, where it stays untouched while the app
 * loads beside it (src/lib/static-shell.ts), so the headline paints with the
 * page and nothing moves when the app takes over: the same components draw both.
 *
 * Every handler is inert: until the app has loaded, the controls are pictures
 * of themselves, as they are on the pre-built pages before their script runs.
 * The appearance is the default one (light, cobalt, cool), like those pages.
 */
export function HomeShell({ base, catalog, asOf }: { base: string; catalog: Catalog; asOf: Date }) {
  const none = () => undefined;
  return (
    <>
      <Ticker catalog={catalog} asOf={asOf} />
      <Header
        base={base}
        view="estimate"
        onView={none}
        pricesChangedOn={catalog.pricesLastChanged()}
        sourcesCheckedOn={catalog.sourcesLastChecked()}
        degraded={catalog.health?.outcome === 'degraded'}
        tourActive={false}
        tourPulse={false}
        onTour={none}
        onCommandPalette={none}
        theme="light"
        accent="cobalt"
        canvas="cool"
        onTheme={none}
        onAccent={none}
        onCanvas={none}
      />
      <main className="main">
        <section aria-labelledby="estimate-heading">
          <EstimateHero base={base} catalog={catalog} onOpenData={none} />
        </section>
      </main>
    </>
  );
}
