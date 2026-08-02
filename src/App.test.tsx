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
      pricing: { input: 3, output: 15, cachedInput: 0.3 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      capabilityIndex: 90,
      provenance: { source: 'vendor', lastVerified: '2026-08-01' },
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

  it('reports a failure to load prices instead of rendering empty numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    render(<App />);
    expect(await screen.findByText(/Pricing data could not be loaded/)).toBeInTheDocument();
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
      // The old behaviour left sys=800 in the URL while the screen showed ~8
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

    // Both links say where they go and open away from the app. The Atom one
    // used to read "AVAILABLE NOW" and open raw XML in the same tab, which is
    // a wall of text arriving with no warning.
    const feed = screen.getByRole('link', { name: /ATOM FEED/ });
    const repo = screen.getByRole('link', { name: /OPEN ON GITHUB/ });
    for (const link of [feed, repo]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
    }
    expect(feed).toHaveAttribute('href', expect.stringContaining('.atom'));
  });

  it('describes the merge rule it actually uses for flagged rows', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Data & Alerts' }));
    expect(await screen.findByText(/the cross-check raises a hand, it never overwrites/)).toBeInTheDocument();
  });
});
