import { describe, expect, it } from 'vitest';
import { issueToken, verifyToken } from './tokens';

const SECRET = 'a-secret-long-enough-to-be-plausible';

describe('signed link tokens', () => {
  it('round-trips a subject through issue and verify', async () => {
    const token = await issueToken(SECRET, 'unsubscribe', 'sub_123');
    await expect(verifyToken(SECRET, 'unsubscribe', token)).resolves.toEqual({
      ok: true,
      subjectId: 'sub_123',
    });
  });

  /**
   * The property that matters most. An unsubscribe link travels through mail
   * scanners, forwards and archives; if it also authorised preference changes,
   * every one of those copies would be a credential for someone's settings.
   */
  it('refuses a token issued for a different purpose', async () => {
    const token = await issueToken(SECRET, 'unsubscribe', 'sub_123');
    await expect(verifyToken(SECRET, 'preferences', token)).resolves.toEqual({
      ok: false,
      reason: 'wrong-purpose',
    });
    await expect(verifyToken(SECRET, 'confirm', token)).resolves.toEqual({
      ok: false,
      reason: 'wrong-purpose',
    });
  });

  it('refuses a token signed with a different secret', async () => {
    const token = await issueToken('some-other-secret-entirely', 'confirm', 'sub_123');
    await expect(verifyToken(SECRET, 'confirm', token)).resolves.toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('refuses a token whose claims have been edited', async () => {
    const token = await issueToken(SECRET, 'preferences', 'sub_123');
    const [version, , signature] = token.split('.');
    const forged = btoa(JSON.stringify({ p: 'preferences', s: 'sub_victim', e: 4102444800 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await expect(verifyToken(SECRET, 'preferences', `${version}.${forged}.${signature}`)).resolves.toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('expires a confirmation token after 48 hours', async () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = await issueToken(SECRET, 'confirm', 'sub_123', issuedAt);

    const justInside = issuedAt + 47 * 60 * 60 * 1000;
    await expect(verifyToken(SECRET, 'confirm', token, justInside)).resolves.toEqual({
      ok: true,
      subjectId: 'sub_123',
    });

    const justOutside = issuedAt + 49 * 60 * 60 * 1000;
    await expect(verifyToken(SECRET, 'confirm', token, justOutside)).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('expires a mobile preferences token after 30 minutes', async () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = await issueToken(SECRET, 'mobile-preferences', 'sub_123', issuedAt);

    await expect(
      verifyToken(SECRET, 'mobile-preferences', token, issuedAt + 29 * 60 * 1000),
    ).resolves.toEqual({
      ok: true,
      subjectId: 'sub_123',
    });
    await expect(
      verifyToken(SECRET, 'mobile-preferences', token, issuedAt + 31 * 60 * 1000),
    ).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  /**
   * Unsubscribe links have to keep working. Someone digging up a year-old
   * newsletter to get off the list must not be told the link has expired —
   * that is precisely the situation where a broken link becomes a complaint.
   */
  it('keeps unsubscribe tokens valid for a year', async () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = await issueToken(SECRET, 'unsubscribe', 'sub_123', issuedAt);
    const elevenMonths = issuedAt + 334 * 24 * 60 * 60 * 1000;
    await expect(verifyToken(SECRET, 'unsubscribe', token, elevenMonths)).resolves.toEqual({
      ok: true,
      subjectId: 'sub_123',
    });
  });

  it.each([
    ['empty', ''],
    ['not a token', 'hello'],
    ['wrong version', '2.abc.def'],
    ['missing signature', '1.abc'],
    ['extra segments', '1.a.b.c'],
  ])('rejects a malformed token (%s)', async (_label, token) => {
    const result = await verifyToken(SECRET, 'confirm', token);
    expect(result.ok).toBe(false);
  });
});
