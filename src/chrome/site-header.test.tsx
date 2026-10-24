import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { layout, type RenderContext } from '@/lib/seo/render';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { mountSiteHeader } from './site-header';

/**
 * The live header on the generated pages: the page arrives with the header
 * already in its HTML, and `mountSiteHeader` makes it work. These tests build
 * a real generated page, mount over its real markup, and use the controls.
 */

const CONTEXT: RenderContext = {
  siteUrl: 'https://promptspend.com',
  basePath: '/',
  cssPath: '/assets/pages.css',
  generatedAt: '2026-10-24T02:00:00.000Z',
  apiUrl: 'https://promptspend.dev',
  hashInline: () => 'hash',
  freshness: { models: 1, pricesChangedOn: '2026-10-21', sourcesCheckedOn: '2026-10-24', degraded: false },
};

function openPage(path = '/free-tiers/') {
  const html = layout(CONTEXT, {
    path,
    title: 'A page',
    description: 'A page.',
    graph: [{ '@type': 'WebPage' }],
    body: '<main id="main"><h1>A page</h1></main>',
  });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  const mount = document.getElementById('site-header')!;
  act(() => mountSiteHeader(mount));
  return mount;
}

const CATALOG = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-10-24T06:00:00.000Z',
  providers: [{ id: 'acme', name: 'Acme', country: 'US' }],
  models: [
    {
      id: 'acme-mini',
      providerId: 'acme',
      displayName: 'Acme Mini',
      status: 'current',
      contextWindow: 1000,
      pricing: { input: 1, output: 2 },
      tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 2 },
      capabilities: { reasoning: false, vision: false },
      capabilityIndex: 50,
      provenance: { source: 'litellm', lastVerified: '2026-10-24' },
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('the live header on a generated page', () => {
  it('keeps the freshness line, the current page and the same controls once it is live', () => {
    const mount = openPage();
    expect(mount.querySelector('.freshness__text')?.textContent).toBe(
      'prices last changed 2026-10-21 · sources checked 2026-10-24',
    );
    expect(within(mount).getByRole('link', { name: 'Free Tiers' })).toHaveAttribute('aria-current', 'page');
    expect(within(mount).getByRole('link', { name: /Apps/ })).toHaveAttribute('href', '/app/');
    expect(within(mount).getByRole('button', { name: 'Guided tour' })).toBeInTheDocument();
  });

  it('switches to dark mode, remembers it, and lets the whole page follow', () => {
    const mount = openPage();
    fireEvent.click(within(mount).getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('ps.theme')).toBe('dark');
    expect(within(mount).getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('offers the accent and canvas pickers, and applies what is chosen', () => {
    const mount = openPage();
    fireEvent.click(within(mount).getByRole('button', { name: 'Appearance options' }));
    fireEvent.click(within(mount).getByRole('button', { name: 'Violet accent' }));
    fireEvent.click(within(mount).getByRole('button', { name: /Warm/ }));
    expect(document.documentElement.dataset.accent).toBe('violet');
    expect(document.documentElement.dataset.canvas).toBe('warm');
    expect(localStorage.getItem('ps.accent')).toBe('violet');
  });

  it('opens search with Ctrl K and finds a model page', async () => {
    openPage();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/data/pricing.json', expect.anything()));
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'acme mini' } });
    expect(await within(dialog).findByText('Acme Mini: price page')).toBeInTheDocument();
    // The page's own destinations are there from the start.
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'guided tour' } });
    expect(within(dialog).getByText('Start the guided tour')).toBeInTheDocument();
  });

  it('shows the dark artwork of a badge only in dark mode, whatever the operating system says', () => {
    const mount = openPage();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<picture><source srcset="/dark.svg" media="(prefers-color-scheme: dark)" /><img src="/light.svg" alt="" /></picture>',
    );
    fireEvent.click(within(mount).getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.querySelector('picture source')!.getAttribute('media')).toBe('all');
    fireEvent.click(within(mount).getByRole('button', { name: 'Switch to light mode' }));
    expect(document.querySelector('picture source')!.getAttribute('media')).toBe('not all');
  });
});
