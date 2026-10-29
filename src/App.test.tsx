import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { SCHEMA_VERSION, type PricingCatalog } from '@/lib/pricing/types';

/**
 * Pin the alerts API to "not configured" for this suite.
 *
 * Without this the branch under test depends on whether a developer happens to
 * have a `.env.local` — the assertion below would pass on CI and fail on the
 * machine of anyone pointing a local build at a real worker. The configured
 * branch is covered in AlertsPanel.test.tsx, which mocks the opposite value.
 */
vi.mock('@/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config')>()),
  ALERTS_API: '',
}));

const CATALOG: PricingCatalog = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-08-01T06:00:00.000Z',
  providers: [
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
    { id: 'deepseek', name: 'DeepSeek', country: 'CN' },
  ],
  models: [
    {
      id: 'claude-sonnet-5',
      providerId: 'anthropic',
      displayName: 'Claude Sonnet 5',
      status: 'current',
      contextWindow: 1_000_000,
      pricing: { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      capabilityIndex: 90,
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-01',
        verifiedUrl: 'https://www.anthropic.com/pricing',
      },
    },
    {
      id: 'deepseek-deepseek-v3.2',
      providerId: 'deepseek',
      displayName: 'DeepSeek V3.2',
      status: 'current',
      contextWindow: 163_840,
      pricing: { input: 0.28, output: 0.4 },
      tokenizer: { kind: 'approx', charsPerToken: 3.4, cjkCharsPerToken: 1.7 },
      capabilities: { reasoning: true, vision: false },
      capabilityIndex: 74,
      provenance: { source: 'litellm', lastVerified: '2026-08-01' },
    },
  ],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderApp() {
  render(<App />);
  await waitFor(() => expect(screen.getByText(/Know the tab/)).toBeInTheDocument());
}

describe('App', () => {
  it('loads the catalog and prices every selected model', async () => {
    await renderApp();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('DeepSeek V3.2')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('CHEAPEST')).toBeInTheDocument();
  });

  it('shows the premium over the cheapest option in the second card', async () => {
    await renderApp();
    const cards = screen.getAllByRole('article');
    expect(within(cards[1]!).getByText(/^\+\$/)).toBeInTheDocument();
  });

  it('explains the numbers as they change', async () => {
    await renderApp();
    expect(screen.getByText(/Output is/)).toBeInTheDocument();
    expect(screen.getByText(/Re-sent history is/)).toBeInTheDocument();
  });

  it('recomputes when the workload changes', async () => {
    await renderApp();
    const before = screen.getAllByRole('article')[0]!.textContent;

    // A longer conversation resends more history, so cost must rise.
    fireEvent.change(screen.getByLabelText('Turns per conversation'), { target: { value: '20' } });

    await waitFor(() => {
      expect(screen.getAllByRole('article')[0]!.textContent).not.toBe(before);
    });
  });

  it('switches a field to pasted text and counts it', async () => {
    const user = userEvent.setup();
    await renderApp();

    const pasteButtons = screen.getAllByRole('button', { name: 'Paste text' });
    await user.click(pasteButtons[0]!);
    const textarea = screen.getByPlaceholderText(/Paste your actual system prompt/);
    await user.type(textarea, 'You are a helpful assistant.');

    await waitFor(() => {
      expect(screen.getByText(/≈ \d+ tok · est/)).toBeInTheDocument();
    });
  });

  it('keeps the shareable URL in step with the scenario', async () => {
    await renderApp();
    await waitFor(() => {
      expect(window.location.search).toMatch(/m=/);
      expect(window.location.search).toMatch(/sys=800/);
    });
  });

  /**
   * The emailed preferences link is `/?alerts=<token>`, and it arrived at a page
   * that had already destroyed it: the URL writer rebuilt the whole query string
   * from the scenario, so every parameter it did not own was silently dropped.
   * The link appeared to work — it just landed on the estimator with nothing
   * selected and no way to tell why.
   */
  it('does not destroy query parameters the scenario does not own', async () => {
    window.history.replaceState(null, '', '/?utm_source=newsletter');
    await renderApp();

    await waitFor(() => expect(window.location.search).toMatch(/sys=800/));
    expect(window.location.search).toMatch(/utm_source=newsletter/);
  });

  it('restores a scenario from the URL', async () => {
    window.history.replaceState(null, '', '/?m=claude-sonnet-5&t=12&sys=1500');
    await renderApp();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('adds and removes models from the comparison', async () => {
    const user = userEvent.setup();
    await renderApp();

    const list = screen.getByRole('group', { name: 'Available models' });
    const boxes = within(list).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.filter((box) => box.checked)).toHaveLength(2);

    await user.click(boxes[0]!);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));

    await user.click(boxes[0]!);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
  });

  /**
   * The country filter, from the reader's side.
   *
   * The flag beside every provider answered "where is this one from?" and
   * nothing else; the question people actually arrive with is "show me only the
   * ones from China". Filtering is a *view*: the models already ticked stay
   * ticked and keep their cost cards, because hiding a row is not the same as
   * deciding it is no longer wanted.
   */
  it('narrows the model picker to a chosen country and back', async () => {
    const user = userEvent.setup();
    await renderApp();

    const list = screen.getByRole('group', { name: 'Available models' });
    const filter = screen.getByRole('group', { name: 'Show models from these countries' });
    expect(within(list).getByText('Claude Sonnet 5')).toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filter).getByRole('button', { name: /^CN/ }));

    expect(within(list).queryByText('Claude Sonnet 5')).not.toBeInTheDocument();
    expect(within(list).getByText('DeepSeek V3.2')).toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    // Hidden, not unpicked: both cost cards are still there.
    expect(screen.getAllByRole('article')).toHaveLength(2);

    await user.click(within(filter).getByRole('button', { name: 'All' }));
    expect(within(list).getByText('Claude Sonnet 5')).toBeInTheDocument();
  });

  it('opens the command palette on Ctrl+K', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('runs the guided tour in a card that stays on screen', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Take the tour/ }));

    const tour = await screen.findByRole('status');
    expect(within(tour).getByText('STEP 1 / 6')).toBeInTheDocument();
    expect(document.body.classList.contains('tour-active')).toBe(true);

    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(within(tour).getByText('STEP 2 / 6')).toBeInTheDocument();
  });

  it('starts the guided tour when another page links to /#tour, and drops the word from the address', async () => {
    // The Receipt page's and the generated pages' "Guided tour" button is a link
    // to the calculator with #tour: their header cannot run the tour itself.
    window.history.replaceState(null, '', '/#tour');
    await renderApp();

    const tour = await screen.findByRole('status');
    expect(within(tour).getByText('STEP 1 / 6')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('navigates to the other views', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('group', { name: /Scatter plot/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText(/Seven lessons/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Data & Alerts' }));
    expect(await screen.findByText(/Every number shows its work/)).toBeInTheDocument();
  });

  it('can be reached: the free-tier comparison is linked from the header, home page, footer, palette and Compare', async () => {
    // Shipped once with links only on the generated pages, so nobody arriving
    // at the calculator could find it. Owner review, 2026-10-06.
    const user = userEvent.setup();
    await renderApp();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Free Tiers' })).toHaveAttribute('href', '/free-tiers/');
    // The home page says it too, so a phone, where the nav scrolls, still shows it.
    expect(screen.getAllByRole('link', { name: /which providers have a free tier/ })[0]).toHaveAttribute(
      'href',
      '/free-tiers/',
    );
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Free Tiers' })).toHaveAttribute('href', '/free-tiers/');

    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const compare = await screen.findByRole('region', { name: /Price is a/ });
    expect(within(compare).getByRole('link', { name: /which providers have a free tier/ })).toHaveAttribute(
      'href',
      '/free-tiers/',
    );

    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByText(/Compare free tiers/)).toBeInTheDocument();
  });

  it('reports a failure to load prices instead of rendering empty numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    render(<App />);
    expect(await screen.findByText(/Pricing data could not be loaded/)).toBeInTheDocument();
  });

  it('offers a way to try again, and recovers when the second attempt succeeds', async () => {
    const user = userEvent.setup();
    let failing = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        failing
          ? new Response('nope', { status: 500 })
          : new Response(JSON.stringify(CATALOG), { status: 200 }),
      ),
    );
    render(<App />);
    await screen.findByText(/Pricing data could not be loaded/);
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText(/Know the tab/)).toBeInTheDocument());
  });
});

describe('honesty of the default estimate', () => {
  it('starts with caching off, so the headline carries no unrequested discount', async () => {
    await renderApp();
    const cache = screen.getByLabelText(/Assume prompt caching/) as HTMLInputElement;
    expect(cache.checked).toBe(false);
    expect(window.location.search).toMatch(/cache=0\.00/);
    // ...and it is on the panel, not hidden inside "Advanced".
    expect(cache.closest('details')).toBeNull();
  });

  it('draws a bill whose parts add up to its total once cache writes are charged', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByLabelText(/Assume prompt caching/));
    const card = (await screen.findAllByRole('article')).find((el) =>
      within(el).queryByText('Claude Sonnet 5'),
    )!;
    const money = (text: string) => Number(/\$([\d,]+(?:\.\d+)?)/.exec(text)![1]!.replaceAll(',', ''));
    const legend = card.querySelector('.cost-card__legend')!.textContent!;
    const spans = [...card.querySelectorAll('.cost-card__legend span')].map((el) => el.textContent ?? '');
    const part = (label: string) => money(spans.find((text) => text.startsWith(label))!);
    const total = money(card.querySelector('.cost-card__total')!.textContent!);
    expect(legend).toMatch(/WRITE/);
    // Each figure is rounded to the dollar, so allow a dollar per part.
    expect(Math.abs(part('IN') + part('WRITE') + part('OUT') - total)).toBeLessThanOrEqual(2);
    // The saving is a comparison, not a fourth charge, and says so.
    expect(legend).toMatch(/vs no cache/);
  });

  it('lists the cache assumptions only once caching is switched on', async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(screen.queryByText(/assumed to hit the cache/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/Assume prompt caching/));
    expect(await screen.findByText(/60% of input tokens assumed to hit the cache/)).toBeInTheDocument();
    // DeepSeek in the fixture publishes no cached rate; the estimate says so
    // rather than inventing a discount for it.
    expect(screen.getByText(/publishes no cached-input rate/)).toBeInTheDocument();
  });

  it('always states what the prices do not cover', async () => {
    await renderApp();
    expect(screen.getByText(/Regional\/data-residency premiums/)).toBeInTheDocument();
  });

  it('warns when the scenario could not actually run', async () => {
    // DeepSeek's window in the fixture is 163,840 tokens; 30 turns of this
    // workload is far past it.
    window.history.replaceState(null, '', '/?m=deepseek-deepseek-v3.2&t=200&sys=200000&usr=200000');
    await renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(/context window/);
  });

  it('renders a permitted-but-extreme URL instead of blanking the page', async () => {
    window.history.replaceState(
      null,
      '',
      '/?m=claude-sonnet-5&sys=200000&usr=200000&out=200000&t=200&cpd=100000000&mau=100000000',
    );
    await renderApp();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.getByText(/Know the tab/)).toBeInTheDocument();
  });
});

describe('sharing a pasted prompt', () => {
  it('puts the derived count in the URL and never the text', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getAllByRole('button', { name: 'Paste text' })[0]!);
    const textarea = screen.getByPlaceholderText(/Paste your actual system prompt/);
    await user.type(textarea, 'You are a helpful assistant.');

    await waitFor(() => {
      // The old behavior left sys=800 in the URL while the screen showed ~8
      // tokens, then told the user the link restored every input.
      expect(window.location.search).not.toMatch(/sys=800/);
      expect(window.location.search).toMatch(/px=system/);
    });
    expect(window.location.search).not.toMatch(/helpful/);
  });

  it('says so when a link restores counts that came from someone else’s prompt', async () => {
    window.history.replaceState(null, '', '/?m=claude-sonnet-5&sys=94&px=system');
    await renderApp();
    expect(screen.getByText(/Restored from a shared link/)).toBeInTheDocument();
  });
});

describe('Compare answers a buying question', () => {
  const rowNames = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).queryByText(/^(Claude Sonnet 5|DeepSeek V3\.2)$/)?.textContent)
      .filter(Boolean);

  it('narrows the table by minimum context and says how to undo it', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const table = await screen.findByRole('table');
    expect(rowNames(table)).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText('Minimum context'), '500000');
    expect(rowNames(table)).toEqual(['Claude Sonnet 5']);
    expect(screen.getByText(/1 of 2 models shown/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear search and context filter/ }));
    expect(rowNames(table)).toHaveLength(2);
  });

  it('searches by model or provider', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const table = await screen.findByRole('table');

    await user.type(screen.getByLabelText(/Search the table/), 'deepseek');
    expect(rowNames(table)).toEqual(['DeepSeek V3.2']);

    await user.clear(screen.getByLabelText(/Search the table/));
    await user.type(screen.getByLabelText(/Search the table/), 'zzz-no-such-model');
    expect(within(table).getByText(/No model matches that search/)).toBeInTheDocument();
  });

  it('ranks by what the workload on Estimate would cost', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const table = await screen.findByRole('table');

    // Highest first, then lowest first: the same two rows swap places.
    await user.click(within(table).getByRole('button', { name: /Your cost/ }));
    const ascending = rowNames(table);
    await user.click(within(table).getByRole('button', { name: /Your cost/ }));
    expect(rowNames(table)).toEqual([...ascending].reverse());
    // DeepSeek is far cheaper than Sonnet at the default workload.
    expect(ascending[0]).toBe('DeepSeek V3.2');
  });
});

describe('home page order', () => {
  /** True when `a` comes before `b` in the document. */
  const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('keeps the evidence card and the aside at the top, ahead of the tool', async () => {
    await renderApp();
    const models = document.getElementById('panel-models')!;
    const evidence = screen.getByText('Where each price was read');
    const aside = screen.getByRole('heading', { name: 'The same numbers, where you work' });
    const headline = screen.getByRole('heading', { level: 1 });

    for (const upper of [evidence, aside]) {
      expect(before(headline, upper)).toBe(true);
      expect(before(upper, models)).toBe(true);
    }
  });

  it('keeps every block that was on the page', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { level: 1, name: /Know the tab/ })).toBeInTheDocument();
    expect(screen.getByText(/pick up to four models/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /which providers have a free tier/ })).toBeInTheDocument();
    expect(screen.getByText('Where each price was read')).toBeInTheDocument();
    expect(screen.getByText(/models tracked/)).toBeInTheDocument();
    expect(screen.getByText(/First time here\?/)).toBeInTheDocument();
    const aside = document.querySelector('.hero__aside') as HTMLElement;
    for (const item of [
      /iPhone & Android apps/,
      /AI Cost Receipt/,
      /MCP server/,
      /VS.Code extension/,
      /Open VSX/,
      /Pricing API/,
    ]) {
      expect(within(aside).getByText(item)).toBeInTheDocument();
    }
    expect(within(aside).getByRole('link', { name: 'PromptSpend this conversation' })).toBeInTheDocument();
    expect(within(aside).getByRole('button', { name: /How to install each/ })).toBeInTheDocument();
  });

  it('has no app announcement box at the top of any view, and keeps the QR codes in the footer', async () => {
    const user = userEvent.setup();
    await renderApp();
    const checkViews = async () => {
      expect(screen.queryByText(/now on iPhone and Android/)).not.toBeInTheDocument();
      expect(document.querySelector('.launch')).toBeNull();
      const footer = document.querySelector('footer') as HTMLElement;
      expect(
        within(footer).getByRole('img', { name: /QR code: PromptSpend on the App Store/ }),
      ).toBeInTheDocument();
      expect(
        within(footer).getByRole('img', { name: /QR code: PromptSpend on Google Play/ }),
      ).toBeInTheDocument();
    };
    await checkViews();
    for (const view of ['Compare', 'Learn', 'Data & Alerts']) {
      await user.click(screen.getByRole('button', { name: view }));
      await checkViews();
    }
  });
});

describe('keyboard and screen-reader access', () => {
  it('makes every point on the value map focusable and operable', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Compare' }));

    // Previously: one circle per model, none of them reachable by anything but
    // a mouse, and no way at all to select a model with the keyboard here.
    const points = await screen.findAllByRole('button', { name: /per million tokens/ });
    expect(points.length).toBe(2);

    const point = points[0]!;
    const wasSelected = point.getAttribute('aria-pressed');
    // Focusing a point shows its tooltip, which is a state update.
    act(() => point.focus());
    expect(document.activeElement).toBe(point);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(point.getAttribute('aria-pressed')).not.toBe(wasSelected));
  });

  it('lets the catalog table add a model without touching the chart', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Compare' }));

    const table = await screen.findByRole('table');
    const box = within(table).getByRole('checkbox', { name: /Add DeepSeek V3.2/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await user.click(box);
    await waitFor(() => expect(box.checked).toBe(false));
  });

  it('returns focus to where it came from when the palette closes', async () => {
    const user = userEvent.setup();
    await renderApp();

    const opener = screen.getByRole('button', { name: /Search & commands/ });
    opener.focus();
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Command palette' });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('exposes help text as a control rather than a title attribute', async () => {
    const user = userEvent.setup();
    await renderApp();
    const help = screen.getByRole('button', { name: /What does .Models. mean/ });
    await user.click(help);
    expect(await screen.findByRole('note')).toHaveTextContent(/highest-leverage cost decision/);
  });
});

describe('claims the site makes about itself', () => {
  it('separates when prices changed from when sources were checked', async () => {
    await renderApp();
    expect(screen.getAllByText(/prices last changed/i).length).toBeGreaterThan(0);
  });

  /**
   * Push and email are built, but a build with no `VITE_ALERTS_API` — which is
   * what the test environment is, and what the site ships as until the API has
   * a domain — has nowhere to send a subscription. The rule being defended is
   * the same one as before the feature existed: never render a control that
   * cannot do what it appears to offer. What satisfies it has changed from
   * "say PLANNED" to "detect the missing origin and say so".
   */
  it('does not offer alert controls that cannot work', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Data & Alerts' }));

    expect(await screen.findByText(/Every number shows its work/)).toBeInTheDocument();
    expect(screen.getByText(/built but not switched on for this deployment/)).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Turn on push alerts/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Email address/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /**
   * The panel that reads the token lives in Data & Alerts. Landing on Estimate
   * meant an emailed "manage your preferences" link did visibly nothing.
   */
  it('opens Data & Alerts when an emailed preferences link is followed', async () => {
    window.history.replaceState(null, '', '/?alerts=token-abc');
    // Deliberately not renderApp(): that waits for the Estimate headline, and
    // the whole point is that this link does not land there.
    render(<App />);

    expect(await screen.findByText(/Every number shows its work/)).toBeInTheDocument();
    expect(screen.queryByText(/Know the tab/)).not.toBeInTheDocument();
  });

  it('still offers the two options that need no infrastructure', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Data & Alerts' }));

    expect(await screen.findByText(/Commit feed/)).toBeInTheDocument();
    expect(screen.getByText(/Watch the repository/)).toBeInTheDocument();

    // The feed's primary action copies the address rather than opening it.
    // Opening an Atom feed in a browser shows raw XML — a page of rubbish, and
    // never what anyone wanted. It used to read "AVAILABLE NOW" and open in the
    // same tab, which is how it got clicked.
    expect(screen.getByRole('button', { name: /COPY FEED ADDRESS/ })).toBeInTheDocument();

    const raw = screen.getByRole('link', { name: /view raw XML/ });
    const repo = screen.getByRole('link', { name: /OPEN ON GITHUB/ });
    for (const link of [raw, repo]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
    }
    expect(raw).toHaveAttribute('href', expect.stringContaining('.atom'));
    // The copy in the card points at readers, not at the link.
    expect(screen.getByText(/Paste this address into a feed reader/)).toBeInTheDocument();
  });

  it('describes the merge rule it actually uses for flagged rows', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Data & Alerts' }));
    expect(await screen.findByText(/the cross-check raises a hand, it never overwrites/)).toBeInTheDocument();
  });
});
