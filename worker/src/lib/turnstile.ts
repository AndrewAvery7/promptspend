/**
 * Turnstile verification.
 *
 * This is the cost control, not a nicety. Double opt-in means an unconfirmed
 * address never receives a second message, but the *confirmation* mail is sent
 * before anyone has proved anything — so a script posting a hundred thousand
 * addresses would send a hundred thousand emails, burn the free quota, and put
 * the sending domain's reputation on the floor. Turnstile stops that at the
 * door; the rate limiter is only the backstop.
 *
 * Verification is skipped when no secret is configured, which is what makes
 * local development and the pre-domain deployment workable. `POST /v1/config`
 * reports whether it is on, so the UI never renders a widget that the server
 * will ignore.
 */

import type { Env } from '../env';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** Present when verification actually ran and failed. */
  errorCodes?: string[];
}

export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true };
  if (!token) return { ok: false, errorCodes: ['missing-input-response'] };

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!response.ok) return { ok: false, errorCodes: [`http-${response.status}`] };
    const result = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
    return result.success ? { ok: true } : { ok: false, errorCodes: result['error-codes'] ?? [] };
  } catch {
    // Fail closed. An outage at the verifier is rare; letting an unverified
    // burst through during one is worse than briefly refusing signups.
    return { ok: false, errorCodes: ['verifier-unreachable'] };
  }
}
