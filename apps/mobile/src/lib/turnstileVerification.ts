const MAX_VERIFICATION_MESSAGE_LENGTH = 8_192;

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
      (parsed.origin === 'https://api.promptspend.dev' && parsed.pathname === '/v1/mobile-turnstile') ||
      parsed.origin === 'https://challenges.cloudflare.com'
    );
  } catch {
    return false;
  }
}

export function isVerificationDocument(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'https://api.promptspend.dev' && parsed.pathname === '/v1/mobile-turnstile';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
