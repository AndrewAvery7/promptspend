import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Catalog } from '@/lib/pricing/catalog';
import { SCHEMA_VERSION, type PricingCatalog } from '@/lib/pricing/types';

/**
 * `ALERTS_API` is read at module load, and its emptiness is what puts the panel
 * into its "not switched on" state. Mocking the module is the only way to
 * exercise both branches in one suite.
 */
const API = 'https://alerts.test';
vi.mock('@/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config')>()),
  ALERTS_API: API,
}));

const { AlertsPanel } = await import('./AlertsPanel');

const RAW: PricingCatalog = {
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
      pricing: { input: 3, output: 15 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    },
    {
      id: 'deepseek-v3.2',
      providerId: 'deepseek',
      displayName: 'DeepSeek V3.2',
      status: 'current',
      contextWindow: 163_840,
      pricing: { input: 0.28, output: 0.4 },
      tokenizer: { kind: 'approx', charsPerToken: 3.4, cjkCharsPerToken: 1.7 },
      capabilities: { reasoning: true, vision: false },
      provenance: { source: 'litellm', lastVerified: '2026-08-01' },
    },
  ],
};

const CATALOG = new Catalog(RAW);

const CONFIG = {
  pushEnabled: true,
  emailEnabled: true,
  vapidPublicKey: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  turnstileSiteKey: null,
  turnstileRequired: false,
};

interface Handler {
  (url: string, init?: RequestInit): { status?: number; body: unknown } | undefined;
}

let handlers: Handler[] = [];
let requests: { url: string; body: unknown }[] = [];

function respond(url: string, init?: RequestInit) {
  for (const handler of handlers) {
    const result = handler(url, init);
    if (result) return result;
  }
  return { status: 404, body: { error: 'Not found.' } };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  // The Turnstile loader appends to document.head, which Testing Library's
  // cleanup does not touch. Without this, a test asserting the script is absent
  // would be reading a side-effect left by whichever test ran before it.
  document.getElementById('cf-turnstile-script')?.remove();
  handlers = [(url) => (url.endsWith('/v1/config') ? { body: CONFIG } : undefined)];
  requests = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const parsed: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, body: parsed });
      const { status = 200, body } = respond(url, init);
      return new Response(JSON.stringify(body), { status });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel() {
  return render(<AlertsPanel catalog={CATALOG} theme="light" onToast={() => {}} />);
}

/** A browser that supports push and has not been asked yet. */
function stubPushCapableBrowser() {
  vi.stubGlobal('isSecureContext', true);
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    toJSON: () => ({ keys: { p256dh: 'B'.repeat(87), auth: 'C'.repeat(22) } }),
    unsubscribe: vi.fn(async () => true),
  };
  const registration = {
    pushManager: {
      subscribe: vi.fn(async () => subscription),
      getSubscription: vi.fn(async () => null),
    },
  };
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn(async () => 'granted'),
  });
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
    serviceWorker: {
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  return { subscription, registration };
}

// The opposite case — a build with no API origin, which must offer no controls
// at all — is asserted in App.test.tsx, against the real unmocked module.

describe('email subscription', () => {
  it('sends exactly what the visitor chose, and nothing else', async () => {
    const user = userEvent.setup();
    handlers.push((url) =>
      url.endsWith('/v1/email/subscribe') ? { body: { ok: true, pending: true } } : undefined,
    );
    renderPanel();

    const email = await screen.findByLabelText('Email address');
    await user.type(email, 'reader@example.com');
    await user.click(screen.getByRole('radio', { name: /As it happens/ }));

    const emailCard = email.closest('article')!;
    await user.click(within(emailCard).getByRole('radio', { name: /Just these/ }));
    await user.click(await within(emailCard).findByRole('checkbox', { name: /Claude Sonnet 5/ }));

    await user.click(within(emailCard).getByRole('button', { name: /Send me the confirmation/ }));

    await waitFor(() => expect(screen.getByText(/Almost there/)).toBeInTheDocument());
    const sent = requests.find((request) => request.url.endsWith('/v1/email/subscribe'));
    expect(sent?.body).toEqual({
      email: 'reader@example.com',
      cadence: 'instant',
      scope: 'followed',
      models: ['claude-sonnet-5'],
    });
  });

  /**
   * Double opt-in only means something if the interface says so. A form that
   * reports "subscribed!" when the address is merely pending teaches people to
   * ignore the confirmation mail.
   */
  it('says the subscription is pending rather than done', async () => {
    const user = userEvent.setup();
    handlers.push((url) =>
      url.endsWith('/v1/email/subscribe') ? { body: { ok: true, pending: true } } : undefined,
    );
    renderPanel();

    await user.type(await screen.findByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /Send me the confirmation/ }));

    expect(await screen.findByText(/Almost there/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing else will arrive unless you click/)).toBeInTheDocument();
  });

  it('shows the server’s own words when it refuses', async () => {
    const user = userEvent.setup();
    handlers.push((url) =>
      url.endsWith('/v1/email/subscribe')
        ? { status: 429, body: { error: 'Too many requests from this address. Try again in a few minutes.' } }
        : undefined,
    );
    renderPanel();

    await user.type(await screen.findByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /Send me the confirmation/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many requests/);
  });

  it('offers no email form at all when the service reports email is off', async () => {
    handlers = [
      (url) => (url.endsWith('/v1/config') ? { body: { ...CONFIG, emailEnabled: false } } : undefined),
    ];
    renderPanel();

    expect(await screen.findByText(/AWAITING A SENDING DOMAIN/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });
});

describe('bot protection', () => {
  /**
   * Turnstile is the cost control, not a nicety: without it a script posting
   * addresses would send a confirmation email for each one. The button must
   * therefore stay closed until the challenge has actually produced a token —
   * letting someone submit and be refused by the server would look like our bug.
   */
  it('holds the submit button closed until the challenge is solved', async () => {
    const user = userEvent.setup();
    handlers = [
      (url) =>
        url.endsWith('/v1/config')
          ? { body: { ...CONFIG, turnstileSiteKey: '0xTEST', turnstileRequired: true } }
          : undefined,
    ];
    renderPanel();

    await user.type(await screen.findByLabelText('Email address'), 'reader@example.com');
    expect(screen.getByRole('button', { name: /Send me the confirmation/ })).toBeDisabled();
  });

  it('does not load the third-party widget when it is not required', async () => {
    renderPanel();
    await screen.findByLabelText('Email address');
    expect(document.getElementById('cf-turnstile-script')).toBeNull();
  });
});

describe('the model picker', () => {
  it('only appears once "just these" is chosen', async () => {
    const user = userEvent.setup();
    renderPanel();

    const email = await screen.findByLabelText('Email address');
    const emailCard = email.closest('article')!;
    expect(within(emailCard).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(emailCard).getByRole('radio', { name: /Just these/ }));
    expect(await within(emailCard).findByRole('checkbox', { name: /Claude Sonnet 5/ })).toBeInTheDocument();
  });

  it('filters by model and by provider name', async () => {
    const user = userEvent.setup();
    renderPanel();

    const email = await screen.findByLabelText('Email address');
    const emailCard = email.closest('article')!;
    await user.click(within(emailCard).getByRole('radio', { name: /Just these/ }));

    const filter = within(emailCard).getByLabelText('Filter the model list');
    await user.type(filter, 'deepseek');
    expect(within(emailCard).getByRole('checkbox', { name: /DeepSeek V3.2/ })).toBeInTheDocument();
    expect(within(emailCard).queryByRole('checkbox', { name: /Claude Sonnet 5/ })).not.toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'anthropic');
    expect(within(emailCard).getByRole('checkbox', { name: /Claude Sonnet 5/ })).toBeInTheDocument();
  });

  it('says so when nothing matches instead of showing an empty box', async () => {
    const user = userEvent.setup();
    renderPanel();

    const email = await screen.findByLabelText('Email address');
    const emailCard = email.closest('article')!;
    await user.click(within(emailCard).getByRole('radio', { name: /Just these/ }));
    await user.type(within(emailCard).getByLabelText('Filter the model list'), 'llama');

    expect(within(emailCard).getByText(/No model matches/)).toBeInTheDocument();
  });
});

describe('browser push', () => {
  it('subscribes and reports the endpoint the browser issued', async () => {
    const user = userEvent.setup();
    stubPushCapableBrowser();
    handlers.push((url) => (url.endsWith('/v1/push/subscribe') ? { body: { ok: true } } : undefined));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: /Turn on push alerts/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Send a test/ })).toBeInTheDocument());
    const sent = requests.find((request) => request.url.endsWith('/v1/push/subscribe'));
    expect(sent?.body).toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      keys: { p256dh: 'B'.repeat(87), auth: 'C'.repeat(22) },
      scope: 'all',
    });
  });

  /**
   * A denial is permanent from JavaScript's point of view — the prompt cannot
   * be raised again. Saying "try again" would be advice that cannot work.
   */
  it('explains where to undo a denied permission rather than offering a retry', async () => {
    const user = userEvent.setup();
    stubPushCapableBrowser();
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(async () => 'denied'),
    });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: /Turn on push alerts/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/site settings/);
  });

  it('tells iPhone users to install the site rather than that their browser is unsupported', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    });
    // Neither serviceWorker nor PushManager exists on iOS until installed.
    renderPanel();

    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/does not support the Web Push standard/)).not.toBeInTheDocument();
  });

  it('says plainly that an insecure page cannot do push', async () => {
    vi.stubGlobal('isSecureContext', false);
    renderPanel();
    expect(await screen.findByText(/needs a secure \(https\) connection/)).toBeInTheDocument();
  });
});

describe('managing an existing subscription', () => {
  it('loads preferences from a signed link and saves changes back', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?alerts=token-abc');
    handlers.push((url) =>
      url.includes('/v1/preferences')
        ? {
            body: {
              email: 'reader@example.com',
              status: 'active',
              cadence: 'instant',
              scope: 'followed',
              models: ['claude-sonnet-5'],
            },
          }
        : undefined,
    );
    renderPanel();

    expect(await screen.findByText('reader@example.com')).toBeInTheDocument();
    const manage = screen.getByLabelText('Your email alerts');

    await user.click(within(manage).getByRole('radio', { name: /Weekly digest/ }));
    await user.click(within(manage).getByRole('button', { name: /Save preferences/ }));

    await waitFor(() => {
      const saved = requests.filter((request) => request.url.includes('/v1/preferences') && request.body);
      expect(saved.at(-1)?.body).toEqual({
        cadence: 'weekly',
        scope: 'followed',
        models: ['claude-sonnet-5'],
      });
    });
  });

  /**
   * The token is a bearer credential. Left in the address bar it ends up in
   * browser history and in whatever URL the visitor copies to share their
   * estimate — which would hand their subscription to whoever they sent it to.
   */
  it('removes the token from the address bar as soon as it is read', async () => {
    window.history.replaceState(null, '', '/?alerts=token-abc&m=claude-sonnet-5');
    handlers.push((url) =>
      url.includes('/v1/preferences')
        ? {
            body: {
              email: 'reader@example.com',
              status: 'active',
              cadence: 'weekly',
              scope: 'all',
              models: [],
            },
          }
        : undefined,
    );
    renderPanel();

    expect(await screen.findByText('reader@example.com')).toBeInTheDocument();
    expect(window.location.search).not.toContain('alerts=');
    // ...without taking anything else with it.
    expect(window.location.search).toContain('m=claude-sonnet-5');
  });

  it('explains an expired link instead of failing silently', async () => {
    window.history.replaceState(null, '', '/?alerts=stale-token');
    handlers.push((url) =>
      url.includes('/v1/preferences') ? { status: 401, body: { error: 'Not authorised.' } } : undefined,
    );
    renderPanel();

    expect(await screen.findByText(/could not be opened/)).toBeInTheDocument();
    expect(screen.getByText(/signed and time-limited/)).toBeInTheDocument();
  });
});

describe('when the alerts service is unreachable', () => {
  it('says so, and does not claim the two zero-infrastructure options are broken too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPanel();

    expect(await screen.findByText(/alerts service is not responding/)).toBeInTheDocument();
    expect(screen.getByText(/The two options above still work/)).toBeInTheDocument();
  });
});
