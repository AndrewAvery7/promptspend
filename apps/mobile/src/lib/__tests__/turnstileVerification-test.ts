import {
  createVerificationNonce,
  isAllowedVerificationUrl,
  isVerificationDocument,
  parseTurnstileMessage,
} from '@/lib/turnstileVerification';
import { randomUUID } from 'expo-crypto';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

describe('native Turnstile verification boundary', () => {
  const nonce = 'request-nonce';

  test('uses a CSPRNG UUID and never falls back to predictable randomness', () => {
    const uuid = '40332171-f9ae-4902-ab8a-e6e0d9371234';
    jest.mocked(randomUUID).mockReturnValueOnce(uuid);
    expect(createVerificationNonce()).toBe(uuid);
    jest.mocked(randomUUID).mockReturnValueOnce('predictable');
    expect(createVerificationNonce).toThrow('Secure verification could not start');
    jest.mocked(randomUUID).mockImplementationOnce(() => {
      throw new Error('Native unavailable');
    });
    expect(createVerificationNonce).toThrow('Native unavailable');
  });

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
