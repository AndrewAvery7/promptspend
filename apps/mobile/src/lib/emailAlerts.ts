export type AlertCadence = 'instant' | 'weekly';
export type AlertScope = 'all' | 'followed';

export interface AlertsConfig {
  emailEnabled: boolean;
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
}

export interface EmailAlertPreferences {
  cadence: AlertCadence;
  email: string;
  models: string[];
  scope: AlertScope;
  status: 'active' | 'pending' | 'unsubscribed' | 'bounced';
}

export interface EmailAlertDraft {
  cadence: AlertCadence;
  email: string;
  models: string[];
  scope: AlertScope;
}

const EMAIL = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,190}\.[A-Za-z]{2,}$/;
export const ALERTS_API_URL = (process.env.EXPO_PUBLIC_ALERTS_API ?? 'https://api.promptspend.dev').replace(
  /\/+$/,
  '',
);

export class EmailAlertsError extends Error {}

export function emailValidationMessage(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Enter the email address that should receive price alerts.';
  if (value.length > 254 || !EMAIL.test(value)) return 'That does not look like a complete email address.';
  return null;
}

export function alertDraftValidationMessage(draft: EmailAlertDraft): string | null {
  const emailError = emailValidationMessage(draft.email);
  if (emailError) return emailError;
  if (draft.scope === 'followed' && draft.models.length === 0) {
    return 'Choose at least one model, or select every model in the catalog.';
  }
  return null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ALERTS_API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new EmailAlertsError(
      'The alerts service could not be reached. Check your connection and try again.',
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The alerts service returned an unexpected response.';
    throw new EmailAlertsError(message);
  }
  return body as T;
}

export function fetchAlertsConfig(): Promise<AlertsConfig> {
  return call('/v1/config');
}

export function subscribeEmailAlerts(
  draft: EmailAlertDraft,
  turnstileToken?: string,
): Promise<{ ok: true; pending: true }> {
  return call('/v1/email/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      ...draft,
      client: 'mobile',
      ...(turnstileToken ? { turnstileAction: 'mobile_email_alerts', turnstileToken } : {}),
    }),
  });
}

export function requestEmailManagementCode(
  email: string,
  turnstileToken?: string,
): Promise<{ ok: true; pending: true }> {
  return call('/v1/email/manage/request', {
    method: 'POST',
    body: JSON.stringify({
      client: 'mobile',
      email,
      ...(turnstileToken ? { turnstileAction: 'mobile_email_alerts', turnstileToken } : {}),
    }),
  });
}

export function verifyEmailManagementCode(
  email: string,
  code: string,
): Promise<{ ok: true; preferences: EmailAlertPreferences; token: string }> {
  return call('/v1/email/manage/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export function fetchEmailAlertPreferences(token: string): Promise<EmailAlertPreferences> {
  return call('/v1/preferences', { headers: { Authorization: `Bearer ${token}` } });
}

export function saveEmailAlertPreferences(
  token: string,
  draft: Pick<EmailAlertDraft, 'cadence' | 'models' | 'scope'>,
): Promise<{ ok: true }> {
  return call('/v1/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(draft),
  });
}

export function unsubscribeEmailAlerts(token: string): Promise<{ ok: true }> {
  return call('/v1/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ unsubscribe: true }),
  });
}
