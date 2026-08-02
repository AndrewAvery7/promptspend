/**
 * The alerts API client.
 *
 * Every call goes to one configurable origin. When `ALERTS_API` is empty the
 * whole feature reports itself unavailable rather than throwing — that is the
 * state the site ships in until the API has a domain, and the UI is expected to
 * say so plainly instead of offering a form that cannot work.
 */

import { ALERTS_API } from '@/config';

export interface AlertsConfig {
  pushEnabled: boolean;
  emailEnabled: boolean;
  vapidPublicKey: string | null;
  turnstileSiteKey: string | null;
  turnstileRequired: boolean;
}

export interface EmailPreferences {
  email: string;
  status: 'pending' | 'active' | 'unsubscribed' | 'bounced';
  cadence: 'instant' | 'weekly';
  scope: 'all' | 'followed';
  models: string[];
}

export class AlertsError extends Error {}

/** True when a deployment has been pointed at a live API. */
export const alertsConfigured = ALERTS_API.length > 0;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!alertsConfigured) throw new AlertsError('Alerts are not configured for this deployment.');

  let response: Response;
  try {
    response = await fetch(`${ALERTS_API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new AlertsError('Could not reach the alerts service. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // The worker sends a human-readable `error` for everything a visitor can
    // cause. Anything else means we broke something, and saying so honestly
    // beats blaming the visitor's input.
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The alerts service returned an unexpected error.';
    throw new AlertsError(message);
  }
  return body as T;
}

export function fetchAlertsConfig(): Promise<AlertsConfig> {
  return call<AlertsConfig>('/v1/config');
}

export function subscribePush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  scope: 'all' | 'followed';
  models: string[];
}): Promise<{ ok: true }> {
  return call('/v1/push/subscribe', { method: 'POST', body: JSON.stringify(input) });
}

export function unsubscribePush(endpoint: string): Promise<void> {
  return call('/v1/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
}

export function sendTestPush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: true }> {
  return call('/v1/push/test', { method: 'POST', body: JSON.stringify(input) });
}

export function subscribeEmail(input: {
  email: string;
  cadence: 'instant' | 'weekly';
  scope: 'all' | 'followed';
  models: string[];
  turnstileToken?: string;
}): Promise<{ ok: true; pending: true }> {
  return call('/v1/email/subscribe', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchPreferences(token: string): Promise<EmailPreferences> {
  return call(`/v1/preferences?t=${encodeURIComponent(token)}`);
}

export function savePreferences(
  token: string,
  input: { cadence: 'instant' | 'weekly'; scope: 'all' | 'followed'; models: string[] },
): Promise<{ ok: true }> {
  return call(`/v1/preferences?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unsubscribeByToken(token: string): Promise<{ ok: true }> {
  return call(`/v1/preferences?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify({ unsubscribe: true }),
  });
}
