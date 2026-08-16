import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import { verifyTurnstile } from './turnstile';

const configuredEnv = {
  TURNSTILE_SECRET_KEY: 'secret',
  TURNSTILE_HOSTNAMES: 'promptspend.com,www.promptspend.com',
} as Env;

afterEach(() => {
  vi.restoreAllMocks();
});

function verifyResponse(payload: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('Turnstile verification', () => {
  it('accepts only the expected action on an allowlisted hostname', async () => {
    verifyResponse({ success: true, action: 'mobile_email_alerts', hostname: 'promptspend.com' });
    await expect(verifyTurnstile(configuredEnv, 'token', null, 'mobile_email_alerts')).resolves.toEqual({
      ok: true,
    });
  });

  it('rejects an action mismatch even when Cloudflare reports success', async () => {
    verifyResponse({ success: true, action: 'web_email_alerts', hostname: 'promptspend.com' });
    await expect(verifyTurnstile(configuredEnv, 'token', null, 'mobile_email_alerts')).resolves.toEqual({
      ok: false,
      errorCodes: ['action-mismatch'],
    });
  });

  it('rejects a token solved on a different hostname', async () => {
    verifyResponse({ success: true, action: 'mobile_email_alerts', hostname: 'evil.example' });
    await expect(verifyTurnstile(configuredEnv, 'token', null, 'mobile_email_alerts')).resolves.toEqual({
      ok: false,
      errorCodes: ['hostname-mismatch'],
    });
  });
});
