import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Same reason as the alerts panel suite: `ALERTS_API` is read at module load,
 * and whether it is empty decides whether this banner offers a form at all.
 */
const API = 'https://alerts.test';
vi.mock('@/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config')>()),
  ALERTS_API: API,
}));

const { LaunchBanner } = await import('./LaunchBanner');

const CONFIG = {
  pushEnabled: true,
  emailEnabled: true,
  vapidPublicKey: null,
  turnstileSiteKey: null,
  turnstileRequired: false,
};

let handlers: ((url: string) => { status?: number; body: unknown } | undefined)[] = [];
let requests: { url: string; body: unknown }[] = [];

beforeEach(() => {
  localStorage.clear();
  document.getElementById('cf-turnstile-script')?.remove();
  handlers = [(url) => (url.endsWith('/v1/config') ? { body: CONFIG } : undefined)];
  requests = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const parsed: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, body: parsed });
      for (const handler of handlers) {
        const result = handler(url);
        if (result) return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
      }
      return new Response(JSON.stringify({ ok: true, pending: true }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the launch banner', () => {
  it('announces both platforms without promising a date', async () => {
    render(<LaunchBanner theme="light" />);
    expect(screen.getByText(/coming to iPhone and Android/i)).toBeInTheDocument();

    // The one thing this banner must never do. App review timing is not ours
    // to promise, and a stale date is the exact failure this product argues
    // against everywhere else.
    const text = document.querySelector('.launch')?.textContent ?? '';
    expect(text).not.toMatch(
      /next week|coming soon|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\b20\d\d\b/i,
    );
  });

  it('submits the address to the launch endpoint, not the price-alert one', async () => {
    render(<LaunchBanner theme="light" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /notify me/i }));

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());

    const sent = requests.find((entry) => entry.url.includes('/v1/launch/subscribe'));
    expect(sent?.body).toEqual({
      email: 'reader@example.com',
      client: 'web',
      turnstileAction: 'web_launch_notify',
    });
    expect(requests.some((entry) => entry.url.includes('/v1/email/subscribe'))).toBe(false);
  });

  it('says the signup is not done until the email is confirmed', async () => {
    render(<LaunchBanner theme="light" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /notify me/i }));

    // "You're signed up" would be a lie: nothing is on the list until the
    // confirmation link is clicked.
    await waitFor(() => expect(screen.getByText(/confirm the link/i)).toBeInTheDocument());
  });

  it('refuses an empty address instead of posting one', async () => {
    render(<LaunchBanner theme="light" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /notify me/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter an email address/i);
    expect(requests.some((entry) => entry.url.includes('/v1/launch/subscribe'))).toBe(false);
  });

  it('surfaces the server error rather than claiming success', async () => {
    handlers.push((url) =>
      url.includes('/v1/launch/subscribe')
        ? { status: 400, body: { error: 'That does not look like an email address.' } }
        : undefined,
    );
    render(<LaunchBanner theme="light" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /notify me/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like an email address/i);
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it('keeps the announcement but drops the form when email is switched off', async () => {
    handlers = [
      (url) => (url.endsWith('/v1/config') ? { body: { ...CONFIG, emailEnabled: false } } : undefined),
    ];
    render(<LaunchBanner theme="light" />);

    expect(screen.getByText(/coming to iPhone and Android/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /notify me/i })).not.toBeInTheDocument());
  });

  /**
   * Signing up is an answer to this banner, the same as closing it. Showing the
   * form again on the next visit asks someone who already handed over an
   * address to hand it over a second time.
   */
  it('does not come back on the next visit once an address is given', async () => {
    const { unmount } = render(<LaunchBanner theme="light" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /notify me/i }));
    // The confirmation stays up for the rest of this visit — it is the
    // instruction to go and click the link.
    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());

    unmount();
    render(<LaunchBanner theme="light" />);
    expect(screen.queryByText(/coming to iPhone and Android/i)).not.toBeInTheDocument();
  });

  it('stays dismissed on the next visit', async () => {
    const { unmount } = render(<LaunchBanner theme="light" />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/coming to iPhone and Android/i)).not.toBeInTheDocument();

    unmount();
    render(<LaunchBanner theme="light" />);
    expect(screen.queryByText(/coming to iPhone and Android/i)).not.toBeInTheDocument();
  });

  it('waits for a Turnstile token before allowing a submit', async () => {
    handlers = [
      (url) =>
        url.endsWith('/v1/config')
          ? { body: { ...CONFIG, turnstileRequired: true, turnstileSiteKey: '0xTEST' } }
          : undefined,
    ];
    render(<LaunchBanner theme="light" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /notify me/i })).toBeDisabled());
  });
});
