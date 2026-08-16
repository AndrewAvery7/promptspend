import {
  isAllowedVerificationUrl,
  isVerificationDocument,
  parseTurnstileMessage,
} from '@/lib/turnstileVerification';

describe('native Turnstile verification boundary', () => {
  const nonce = 'request-nonce';

  test('accepts only a well-formed token for the current request', () => {
    const token = 'verified-token-with-enough-entropy';
    expect(parseTurnstileMessage(JSON.stringify({ nonce, token, type: 'token' }), nonce)).toEqual({
      kind: 'token',
      token,
    });
  });

  test.each([
    ['', 'invalid response'],
    ['not-json', 'unreadable response'],
    [JSON.stringify({ nonce }), 'invalid response'],
    [
      JSON.stringify({
        nonce: 'another-request',
        token: 'verified-token-with-enough-entropy',
        type: 'token',
      }),
      'could not be matched',
    ],
    [JSON.stringify({ nonce, token: 'short', type: 'token' }), 'invalid token'],
    [JSON.stringify({ nonce, type: 'unexpected' }), 'unknown response'],
  ])('rejects untrusted message %#', (raw, message) => {
    expect(parseTurnstileMessage(raw, nonce)).toEqual(
      expect.objectContaining({ kind: 'invalid', message: expect.stringContaining(message) }),
    );
  });

  test('rejects oversized messages before parsing', () => {
    expect(parseTurnstileMessage('x'.repeat(8_193), nonce)).toEqual(
      expect.objectContaining({ kind: 'invalid' }),
    );
  });

  test('keeps expiration and provider failure distinct', () => {
    expect(parseTurnstileMessage(JSON.stringify({ nonce, type: 'expired' }), nonce)).toEqual({
      kind: 'expired',
    });
    expect(parseTurnstileMessage(JSON.stringify({ nonce, type: 'error' }), nonce)).toEqual({
      kind: 'error',
    });
  });

  test('allows only the hosted document and Cloudflare challenge navigation', () => {
    expect(isVerificationDocument('https://api.promptspend.dev/v1/mobile-turnstile?nonce=x')).toBe(true);
    expect(isVerificationDocument('https://api.promptspend.dev/v1/mobile-turnstile/extra')).toBe(false);
    expect(isAllowedVerificationUrl('https://challenges.cloudflare.com/turnstile/v0/')).toBe(true);
    expect(isAllowedVerificationUrl('about:blank')).toBe(true);
    expect(isAllowedVerificationUrl('https://promptspend.dev/')).toBe(false);
    expect(isAllowedVerificationUrl('javascript:alert(1)')).toBe(false);
  });
});
