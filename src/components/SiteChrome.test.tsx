import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Ticker } from './Ticker';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { ReceiptPage } from '@/receipt/ReceiptPage';
import { DEVELOPER_HUB_URL } from '@/config';
import { Catalog } from '@/lib/pricing/catalog';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { layout, renderAppPage, type RenderContext } from '@/lib/seo/render';

/**
 * The site draws its header and footer in three places: the calculator
 * (`Header.tsx`, `SiteFooter.tsx`), the Receipt page (its own header, the same
 * footer) and every generated page (`layout` in `seo/render.ts`, which ships no
 * JavaScript and so cannot reuse the React components).
 *
 * They had drifted: the Receipt page had no Free Tiers link, the generated pages
 * had no header, and the generated footer listed different links. These tests
 * read all of them and fail when one stops matching the others.
 */

const CONTEXT: RenderContext = {
  siteUrl: 'https://promptspend.com',
  basePath: '/',
  cssPath: '/assets/pages.css',
  generatedAt: '2026-08-02T02:00:00.000Z',
  apiUrl: DEVELOPER_HUB_URL,
  hashInline: () => 'hash',
  freshness: { models: 1, pricesChangedOn: '2026-07-04', sourcesCheckedOn: '2026-07-05', degraded: false },
};

function generated(path = '/models/', ctx: RenderContext = CONTEXT) {
  const html = layout(ctx, {
    path,
    title: 'A page',
    description: 'A page.',
    graph: [{ '@type': 'WebPage' }],
    body: '<main id="main"><h1>A page</h1></main>',
  });
  return new DOMParser().parseFromString(html, 'text/html');
}

function words(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
}

function textLinks(root: ParentNode): [string, string][] {
  return [...root.querySelectorAll('a[href]')]
    .map((a): [string, string] => [
      (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
      a.getAttribute('href')!,
    ])
    .filter(([text]) => text !== '');
}

function tinyCatalog(): Catalog {
  return new Catalog(
    {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-07-05T06:00:00.000Z',
      providers: [{ id: 'acme', name: 'Acme', country: 'US' }],
      models: [
        {
          id: 'acme-1',
          providerId: 'acme',
          displayName: 'Acme 1',
          status: 'current',
          contextWindow: 1000,
          pricing: { input: 1, output: 2 },
          tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 2 },
          capabilities: { reasoning: false, vision: false },
          capabilityIndex: 50,
          provenance: { source: 'vendor', lastVerified: '2026-07-04' },
        },
      ],
    },
    { schemaVersion: 1, outcome: 'ok', succeededAt: '2026-07-05T06:00:00.000Z' } as never,
  );
}

const noop = () => undefined;

function calculatorHeader() {
  return render(
    <Header
      base="/"
      view="estimate"
      onView={noop}
      pricesChangedOn="2026-07-04"
      sourcesCheckedOn="2026-07-05"
      degraded={false}
      tourActive={false}
      tourPulse={false}
      onTour={noop}
      onCommandPalette={noop}
      theme="light"
      accent="cobalt"
      canvas="cool"
      onTheme={noop}
      onAccent={noop}
      onCanvas={noop}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('nope', { status: 500 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIX = ['Estimate', 'Compare', 'Learn', 'Data & Alerts', 'PromptSpend It', 'Free Tiers'];

/** Every control in a header, by the name a person would hear: label or words. */
function controls(root: ParentNode): string[] {
  return [...root.querySelectorAll('.header button, .header a')].map((el) =>
    (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('the header', () => {
  it('has the same six links, with Tiers capitalized, on the calculator', () => {
    calculatorHeader();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(words(nav, 'button, a')).toEqual(SIX);
  });

  it('is the calculator header, control for control, on a generated page', () => {
    // Not a lookalike: the page draws the calculator's own component to static
    // HTML at build time, so everything it has is here - search, Apps, Guided
    // tour, the appearance picker, the dark-mode switch and the freshness line.
    const { container } = calculatorHeader();
    const page = generated('/models/');
    expect(controls(page)).toEqual(controls(container));
    expect(controls(page)).toContain('Appearance options');
    expect(controls(page)).toContain('Switch to dark mode');
    expect(words(page, '.header .freshness__text')).toEqual(words(container, '.freshness__text'));
    expect(words(page, '.header .freshness__text')[0]).toBe(
      'prices last changed 2026-07-04 · sources checked 2026-07-05',
    );
    expect(page.querySelector('.header .kbd-button')).not.toBeNull();
    expect(page.querySelector('.header a.get-app')?.getAttribute('href')).toBe('/app/');
  });

  it('marks the page it is on', () => {
    const nav = generated('/free-tiers/').querySelector('nav[aria-label="Main"]')!;
    expect(words(nav, 'a')).toEqual(['PromptSpend It', 'Free Tiers']);
    expect(nav.querySelector('a[aria-current="page"]')?.textContent).toBe('Free Tiers');
    expect(generated('/models/').querySelector('nav a[aria-current]')).toBeNull();
  });

  it('points the two real pages at the same addresses on the calculator and the generated pages', () => {
    calculatorHeader();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const onGenerated = textLinks(generated().querySelector('nav[aria-label="Main"]')!);
    for (const label of ['PromptSpend It', 'Free Tiers']) {
      const mine = within(nav).getByRole('link', { name: label }).getAttribute('href');
      expect(onGenerated.find(([text]) => text === label)?.[1]).toBe(mine);
    }
  });

  it('is the same header on the Receipt page, controls and all', async () => {
    const { container } = calculatorHeader();
    const calculator = controls(container);
    const receipt = render(<ReceiptPage />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const nav = within(receipt.container).getByRole('navigation', { name: 'Main' });
    expect(words(nav, 'button, a')).toEqual(SIX);
    expect(within(nav).getByRole('link', { name: 'Free Tiers' })).toHaveAttribute('href', '/free-tiers/');
    expect(within(nav).getByRole('link', { name: 'PromptSpend It' })).toHaveAttribute('aria-current', 'page');
    expect(controls(receipt.container)).toEqual(calculator);
    expect(receipt.container.querySelector('.freshness')).not.toBeNull();
  });
});

describe('the footer', () => {
  it('lists the same links on a generated page as on the calculator', () => {
    const { container } = render(<SiteFooter catalog={null} theme="light" />);
    const mine = textLinks(container);
    const theirs = textLinks(generated().querySelector('footer')!);
    expect(theirs).toEqual(mine);
  });

  it('carries the same counts row and the same directory badges on every page, the Free Tiers pages included', () => {
    const catalog = tinyCatalog();
    const { container } = render(<SiteFooter catalog={catalog} theme="light" />);
    // The same three figures the build takes from the catalog (scripts/build-pages.ts).
    const ctx: RenderContext = {
      ...CONTEXT,
      freshness: {
        models: catalog.primaryModels.length,
        pricesChangedOn: catalog.pricesLastChanged(),
        sourcesCheckedOn: catalog.sourcesLastChecked(),
        degraded: false,
      },
    };
    const alts = (root: ParentNode) =>
      [...root.querySelectorAll('.footer__badge img')].map((img) => img.getAttribute('alt'));
    const stats = (root: ParentNode) => words(root, '.footer__stats');
    expect(stats(container)).toHaveLength(1);
    for (const path of ['/models/', '/free-tiers/', '/free-tiers/acme/']) {
      const footer = generated(path, ctx).querySelector('footer')!;
      expect(alts(footer)).toEqual(alts(container));
      expect(alts(footer).length).toBeGreaterThanOrEqual(8);
      expect(stats(footer)).toEqual(stats(container));
    }
  });

  it('offers both apps, with both QR codes and the robot credit, at the top of every footer', () => {
    const { container } = render(<SiteFooter catalog={null} theme="light" />);
    for (const footer of [container, generated().querySelector('footer')!]) {
      const band = footer.querySelector('.footer__apps')!;
      expect(band).not.toBeNull();
      expect(words(band, '.store-qr__code')).toEqual(['iPhone', 'Android']);
      expect(band.querySelectorAll('.store-badges a')).toHaveLength(2);
      expect(band.querySelector('.footer__apps-credit')?.textContent).toMatch(/Android robot/);
      expect(footer.querySelector('.footer__inner')?.firstElementChild).toBe(band);
    }
  });

  it('leaves the band off the app page, which already shows the same badges and codes', () => {
    const page = new DOMParser().parseFromString(renderAppPage(CONTEXT), 'text/html');
    expect(page.querySelector('.footer__apps')).toBeNull();
    expect(page.querySelectorAll('.store-qr__code')).toHaveLength(2);
  });
});

describe('the ticker tape', () => {
  it('runs above the header on every generated page, with the same items as the calculator', () => {
    const catalog = tinyCatalog();
    const asOf = new Date(catalog.generatedAt);
    const { container } = render(<Ticker catalog={catalog} asOf={asOf} />);
    // What the build does: draw the same component to HTML, dated by the catalog.
    const html = renderToStaticMarkup(createElement(Ticker, { catalog, asOf }));
    const ctx: RenderContext = { ...CONTEXT, ticker: html };
    for (const path of ['/models/', '/free-tiers/', '/receipt/']) {
      const page = generated(path, ctx);
      const tape = page.querySelector('.ticker');
      expect(tape).not.toBeNull();
      expect(words(tape!, '.ticker__item')).toEqual(words(container, '.ticker__item'));
      // Above the header, as on the calculator.
      const order = tape!.compareDocumentPosition(page.querySelector('.header')!);
      expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(words(container, '.ticker__item')[0]).toMatch(/^CHEAPEST INPUT TODAY/);
  });
});

describe('first paint', () => {
  it('asks for the header typefaces in the head, before the stylesheets, so the header is not redrawn', () => {
    const fonts = ['/assets/a.woff2', '/assets/b.woff2'];
    const ctx: RenderContext = {
      ...CONTEXT,
      chrome: { script: '/assets/h.js', themeInit: '/assets/t.js', styles: ['/assets/h.css'], fonts },
    };
    const head = generated('/free-tiers/', ctx).head;
    const links = [...head.querySelectorAll('link')].map(
      (link) => link.getAttribute('rel') + ' ' + link.getAttribute('href'),
    );
    expect(links.filter((link) => link.startsWith('preload'))).toEqual(
      fonts.map((font) => `preload ${font}`),
    );
    // Preloaded before any stylesheet is read.
    expect(links.findIndex((link) => link.startsWith('preload'))).toBeLessThan(
      links.findIndex((link) => link.startsWith('stylesheet')),
    );
    expect(head.querySelector('link[rel="preload"]')?.getAttribute('crossorigin')).not.toBeNull();
  });
});
