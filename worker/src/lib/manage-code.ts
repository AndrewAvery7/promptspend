import { b64urlToBytes, bytesToB64url, randomBytes, timingSafeEqual, utf8 } from './bytes';

const CODE_SPACE = 1_000_000;
const UINT32_SPACE = 0x1_0000_0000;
const UNBIASED_LIMIT = Math.floor(UINT32_SPACE / CODE_SPACE) * CODE_SPACE;

/** Six digits, sampled without modulo bias. Email and IP rate limits are the brute-force boundary. */
export function createManageCode(): string {
  let value = UINT32_SPACE;
  while (value >= UNBIASED_LIMIT) {
    const bytes = randomBytes(4);
    value = (bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3]) >>> 0;
  }
  return String(value % CODE_SPACE).padStart(6, '0');
}

export async function hashManageCode(secret: string, subscriberId: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, utf8(`manage-code:${subscriberId}:${code}`));
  return bytesToB64url(signature);
}

export function manageCodeMatches(storedHash: string, candidateHash: string): boolean {
  try {
    return timingSafeEqual(b64urlToBytes(storedHash), b64urlToBytes(candidateHash));
  } catch {
    return false;
  }
}

export function parseManageCode(value: unknown): string | null {
  return typeof value === 'string' && /^\d{6}$/.test(value) ? value : null;
}
