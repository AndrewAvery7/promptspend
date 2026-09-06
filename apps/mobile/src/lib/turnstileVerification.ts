import { randomUUID } from 'expo-crypto';

const MAX_VERIFICATION_MESSAGE_LENGTH = 8_192;
export const VERIFICATION_ORIGIN = 'https://api.promptspend.dev';
export const VERIFICATION_PATH = '/v1/mobile-turnstile';
export const TURNSTILE_PAGE = `${VERIFICATION_ORIGIN}${VERIFICATION_PATH}`;
export const CHALLENGE_ORIGIN = 'https://challenges.cloudflare.com';
export const VERIFICATION_ORIGIN_WHITELIST = [VERIFICATION_ORIGIN, CHALLENGE_ORIGIN, 'about:*'];

/** No predictable fallback: callers must stop verification if secure randomness fails. */
export function createVerificationNonce(): string {
  const nonce = randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    throw new Error('Secure verification could not start. Please try again.');
  }
  return nonce;
}

export type TurnstileMessage =
  | { kind: 'token'; token: string }
  | { kind: 'expired' }
  | { kind: 'error' }
  | { kind: 'invalid'; message: string };

export function parseTurnstileMessage(raw: string, expectedNonce: string): TurnstileMessage {
  if (raw.length === 0 || raw.length > MAX_VERIFICATION_MESSAGE_LENGTH) {
    return { kind: 'invalid', message: 'The secure verification returned an invalid response.' };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', message: 'The secure verification returned an unreadable response.' };
  }

  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.nonce !== 'string') {
    return { kind: 'invalid', message: 'The secure verification returned an invalid response.' };
  }
  if (value.nonce !== expectedNonce) {
    return {
      kind: 'invalid',
      message: 'The secure verification response could not be matched to this request.',
    };
  }

  if (value.type === 'token') {
    if (typeof value.token !== 'string' || value.token.length <= 20 || value.token.length > 4_096) {
      return { kind: 'invalid', message: 'The secure verification returned an invalid token.' };
    }
    return { kind: 'token', token: value.token };
  }
  if (value.type === 'expired') return { kind: 'expired' };
  if (value.type === 'error') return { kind: 'error' };
  return { kind: 'invalid', message: 'The secure verification returned an unknown response.' };
}

export function isAllowedVerificationUrl(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return (
      (parsed.origin === VERIFICATION_ORIGIN && parsed.pathname === VERIFICATION_PATH) ||
      parsed.origin === CHALLENGE_ORIGIN
    );
  } catch {
    return false;
  }
}

export function isVerificationDocument(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === VERIFICATION_ORIGIN && parsed.pathname === VERIFICATION_PATH;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
