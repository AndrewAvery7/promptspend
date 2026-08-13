import { describe, expect, it } from 'vitest';
import { createManageCode, hashManageCode, manageCodeMatches, parseManageCode } from './manage-code';

describe('native email management codes', () => {
  it('creates six-digit codes and validates only that shape', () => {
    for (let index = 0; index < 100; index += 1) expect(createManageCode()).toMatch(/^\d{6}$/);
    expect(parseManageCode('004821')).toBe('004821');
    expect(parseManageCode('4821')).toBeNull();
    expect(parseManageCode('abcdef')).toBeNull();
  });

  it('binds a code hash to both the subscriber and secret', async () => {
    const hash = await hashManageCode('a-secure-test-secret', 'subscriber-a', '482731');
    expect(
      manageCodeMatches(hash, await hashManageCode('a-secure-test-secret', 'subscriber-a', '482731')),
    ).toBe(true);
    expect(
      manageCodeMatches(hash, await hashManageCode('a-secure-test-secret', 'subscriber-b', '482731')),
    ).toBe(false);
    expect(
      manageCodeMatches(hash, await hashManageCode('another-test-secret', 'subscriber-a', '482731')),
    ).toBe(false);
  });
});
