import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { SCHEMA_VERSION, type PricingCatalog } from '@/lib/pricing/types';

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
    expect(await screen.findByRole('img', { name: /Scatter plot/ })).toBeInTheDocument();

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
