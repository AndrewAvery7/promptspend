import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { signPayload } from './lib/signature';
import type { ChangeSet } from './changes';

const API = 'https://alerts.example.com';
const ORIGIN = 'https://andrewavery7.github.io';

beforeEach(async () => {
  for (const table of [
    'email_subscribers',
    'push_subscriptions',
    'follows',
    'events',
    'deliveries',
    'rate_limits',
  ]) {
    await env.DB.exec(`DELETE FROM ${table}`);
  }
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return SELF.fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

/** Pull the confirmation token straight out of the database, as the mail would carry it. */
async function subscriberId(email: string): Promise<string> {
  const row = await env.DB.prepare('SELECT id FROM email_subscribers WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (!row) throw new Error(`no subscriber for ${email}`);
  return row.id;
}

async function tokenFor(purpose: string, id: string): Promise<string> {
  const { issueToken } = await import('./lib/tokens');
  return issueToken(env.TOKEN_SECRET!, purpose as 'confirm', id);
}

describe('meta endpoints', () => {
  it('reports what is actually configured', async () => {
    const response = await SELF.fetch(`${API}/health`);
    const body = (await response.json()) as { ok: boolean; checks: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe('ok');
    // The key pair check is the point of this endpoint: a mismatched pair
    // produces valid-looking JWTs that every push service silently rejects.
    expect(body.checks.vapidKeyPair).toBe('ok');
  });

  it('publishes the VAPID public key so the browser can subscribe', async () => {
    const body = (await (await SELF.fetch(`${API}/v1/config`)).json()) as Record<string, unknown>;
    expect(body.pushEnabled).toBe(true);
    expect(typeof body.vapidPublicKey).toBe('string');
    expect(body.turnstileRequired).toBe(false);
  });
});

describe('CORS', () => {
  it('echoes an allowed origin', async () => {
    const response = await SELF.fetch(`${API}/v1/config`, { headers: { Origin: ORIGIN } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  /**
   * These endpoints take an email address. An unrestricted policy would let any
   * page on the web submit one from a visitor's browser.
   */
  it('refuses an origin that is not on the allowlist', async () => {
    const response = await SELF.fetch(`${API}/v1/config`, { headers: { Origin: 'https://evil.example' } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('email lifecycle', () => {
  it('runs subscribe → confirm → change preferences → unsubscribe', async () => {
    const subscribed = await post('/v1/email/subscribe', {
      email: 'reader@example.com',
      cadence: 'instant',
      scope: 'followed',
      models: ['gpt-5.6-sol', 'claude-sonnet-5'],
    });
    expect(subscribed.status).toBe(200);

    const id = await subscriberId('reader@example.com');
    // Nothing is deliverable until the address is confirmed.
    expect(
      (
        await env.DB.prepare('SELECT status FROM email_subscribers WHERE id = ?')
          .bind(id)
          .first<{ status: string }>()
      )?.status,
    ).toBe('pending');

    const confirm = await SELF.fetch(
      `${API}/v1/email/confirm?t=${encodeURIComponent(await tokenFor('confirm', id))}`,
    );
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain("You're on the list");

    const preferencesToken = await tokenFor('preferences', id);
    const read = await SELF.fetch(`${API}/v1/preferences?t=${encodeURIComponent(preferencesToken)}`);
    const prefs = (await read.json()) as { status: string; models: string[] };
    expect(prefs.status).toBe('active');
    expect(prefs.models.sort()).toEqual(['claude-sonnet-5', 'gpt-5.6-sol']);

    const updated = await post(`/v1/preferences?t=${encodeURIComponent(preferencesToken)}`, {
      cadence: 'weekly',
      scope: 'all',
      models: [],
    });
    expect(updated.status).toBe(200);

    const unsubscribe = await SELF.fetch(
      `${API}/v1/email/unsubscribe?t=${encodeURIComponent(await tokenFor('unsubscribe', id))}`,
      { method: 'POST' },
    );
    expect(unsubscribe.status).toBe(200);
    expect(await unsubscribe.text()).toContain("You're unsubscribed");
  });

  /**
   * Mail clients and security scanners prefetch links. If GET unsubscribed on
   * sight, a scanner would silently remove people from the list.
   */
  it('asks before unsubscribing on a GET, and acts on the POST', async () => {
    await post('/v1/email/subscribe', { email: 'reader@example.com', cadence: 'weekly', scope: 'all' });
    const id = await subscriberId('reader@example.com');
    const token = await tokenFor('unsubscribe', id);

    const prefetch = await SELF.fetch(`${API}/v1/email/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(await prefetch.text()).toContain('Unsubscribe from price alerts?');
    expect(
      (
        await env.DB.prepare('SELECT status FROM email_subscribers WHERE id = ?')
          .bind(id)
          .first<{ status: string }>()
      )?.status,
    ).not.toBe('unsubscribed');
  });

  /** RFC 8058: the mail client POSTs with the token in the query string. */
  it('honours a one-click unsubscribe from a mail client', async () => {
    await post('/v1/email/subscribe', { email: 'reader@example.com', cadence: 'weekly', scope: 'all' });
    const id = await subscriberId('reader@example.com');

    const response = await SELF.fetch(
      `${API}/v1/email/unsubscribe?t=${encodeURIComponent(await tokenFor('unsubscribe', id))}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      },
    );

    expect(response.status).toBe(200);
    // Deleted, not flagged — which is what the unsubscribe page promises.
    expect(
      await env.DB.prepare('SELECT id FROM email_subscribers WHERE id = ?').bind(id).first(),
    ).toBeNull();
  });

  it('answers identically whether or not the address is already known', async () => {
    const first = await post('/v1/email/subscribe', {
      email: 'reader@example.com',
      cadence: 'weekly',
      scope: 'all',
    });
    const second = await post('/v1/email/subscribe', {
      email: 'reader@example.com',
      cadence: 'weekly',
      scope: 'all',
    });
    expect(await first.json()).toEqual(await second.json());
  });

  it('rejects a preferences token that was issued for unsubscribing', async () => {
    await post('/v1/email/subscribe', { email: 'reader@example.com', cadence: 'weekly', scope: 'all' });
    const id = await subscriberId('reader@example.com');
    const response = await SELF.fetch(
      `${API}/v1/preferences?t=${encodeURIComponent(await tokenFor('unsubscribe', id))}`,
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ['a missing address', { cadence: 'weekly', scope: 'all' }],
    ['a malformed address', { email: 'not-an-address', cadence: 'weekly', scope: 'all' }],
    ['an unknown cadence', { email: 'a@example.com', cadence: 'hourly', scope: 'all' }],
    [
      'followed scope with no models',
      { email: 'a@example.com', cadence: 'weekly', scope: 'followed', models: [] },
    ],
  ])('refuses %s', async (_label, body) => {
    expect((await post('/v1/email/subscribe', body)).status).toBe(400);
  });
});

describe('push subscribe', () => {
  const KEYS = { p256dh: 'B'.repeat(87), auth: 'C'.repeat(22) };

  it('accepts a subscription from a real push service', async () => {
    const response = await post('/v1/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: KEYS,
      scope: 'followed',
      models: ['gpt-5.6-sol'],
    });
    expect(response.status).toBe(200);
  });

  /**
   * Without the host allowlist, the endpoint field is a server-side request
   * forgery primitive: an attacker registers an internal URL and this worker
   * POSTs to it, from Cloudflare's network, on every price change.
   */
  it.each([
    'https://evil.example.com/collect',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://192.168.1.1/admin',
    'https://localhost:8080/',
  ])('refuses %s as a push endpoint', async (endpoint) => {
    const response = await post('/v1/push/subscribe', { endpoint, keys: KEYS, scope: 'all' });
    expect(response.status).toBe(400);
  });

  it('refuses subscription keys of the wrong size', async () => {
    const response = await post('/v1/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'too-short', auth: 'C'.repeat(22) },
      scope: 'all',
    });
    expect(response.status).toBe(400);
  });
});

describe('notify', () => {
  const CHANGE_SET: ChangeSet = {
    eventId: 'catalog-abc123def456',
    generatedAt: '2026-08-02T06:00:00.000Z',
    changes: [
      {
        modelId: 'gpt-5.6-sol',
        displayName: 'GPT-5.6 Sol',
        provider: 'OpenAI',
        kind: 'price',
        before: { input: 5, output: 30 },
        after: { input: 4, output: 24 },
      },
    ],
  };

  async function signedPost(body: unknown, secret = env.NOTIFY_SECRET!, timestamp?: string) {
    const raw = JSON.stringify(body);
    const stamp = timestamp ?? String(Math.floor(Date.now() / 1000));
    return SELF.fetch(`${API}/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PromptSpend-Timestamp': stamp,
        'X-PromptSpend-Signature': `v1=${await signPayload(secret, stamp, raw)}`,
      },
      body: raw,
    });
  }

  it('accepts a correctly signed change set', async () => {
    const response = await signedPost(CHANGE_SET);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, eventId: CHANGE_SET.eventId });
  });

  it('treats a repeat of the same event as a no-op', async () => {
    await signedPost(CHANGE_SET);
    const repeat = await signedPost(CHANGE_SET);
    expect(await repeat.json()).toMatchObject({ duplicate: true });
  });

  it('refuses an unsigned or wrongly signed call', async () => {
    const raw = JSON.stringify(CHANGE_SET);
    const unsigned = await SELF.fetch(`${API}/v1/notify`, { method: 'POST', body: raw });
    expect(unsigned.status).toBe(401);

    expect((await signedPost(CHANGE_SET, 'the-wrong-secret-entirely')).status).toBe(401);
  });

  /** A captured request must not stay valid indefinitely. */
  it('refuses a replayed call from more than five minutes ago', async () => {
    const stale = String(Math.floor(Date.now() / 1000) - 600);
    expect((await signedPost(CHANGE_SET, env.NOTIFY_SECRET!, stale)).status).toBe(401);
  });

  it('refuses a signature that does not cover the body actually sent', async () => {
    const stamp = String(Math.floor(Date.now() / 1000));
    const response = await SELF.fetch(`${API}/v1/notify`, {
      method: 'POST',
      headers: {
        'X-PromptSpend-Timestamp': stamp,
        'X-PromptSpend-Signature': `v1=${await signPayload(env.NOTIFY_SECRET!, stamp, JSON.stringify(CHANGE_SET))}`,
      },
      body: JSON.stringify({ ...CHANGE_SET, changes: [] }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a signed but malformed change set with a reason', async () => {
    const response = await signedPost({ eventId: 'short', generatedAt: 'nonsense', changes: [] });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('invalid');
  });
});

describe('unknown routes', () => {
  it('404s without leaking anything', async () => {
    const response = await SELF.fetch(`${API}/v1/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  });
});
