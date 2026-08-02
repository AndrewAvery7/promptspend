import { describe, expect, it } from 'vitest';
import { allowedOrigins, requireSecret, siteUrl, type Env } from './env';

const base = {
  SITE_ORIGIN: 'https://andrewavery7.github.io',
  SITE_BASE_PATH: '/promptspend/',
  ALLOWED_ORIGINS: 'https://andrewavery7.github.io, http://localhost:5173 ,',
} as unknown as Env;

describe('siteUrl', () => {
  /**
   * Both shapes have to work: the project page under a sub-path today, and the
   * custom domain serving from the root once it exists. Getting this wrong
   * sends every confirmation link to a 404.
   */
  it('handles a project page served from a sub-path', () => {
    expect(siteUrl(base)).toBe('https://andrewavery7.github.io/promptspend/');
    expect(siteUrl(base, 'learn')).toBe('https://andrewavery7.github.io/promptspend/learn');
    expect(siteUrl(base, '/learn')).toBe('https://andrewavery7.github.io/promptspend/learn');
  });

  it('handles a custom domain served from the root', () => {
    const root = { ...base, SITE_ORIGIN: 'https://promptspend.dev', SITE_BASE_PATH: '/' } as Env;
    expect(siteUrl(root)).toBe('https://promptspend.dev/');
    expect(siteUrl(root, 'learn')).toBe('https://promptspend.dev/learn');
  });

  it('tolerates sloppy trailing slashes in configuration', () => {
    const sloppy = { ...base, SITE_ORIGIN: 'https://promptspend.dev/', SITE_BASE_PATH: 'app' } as Env;
    expect(siteUrl(sloppy)).toBe('https://promptspend.dev/app/');
  });
});

describe('allowedOrigins', () => {
  it('trims entries and drops the empty ones', () => {
    expect(allowedOrigins(base)).toEqual(['https://andrewavery7.github.io', 'http://localhost:5173']);
  });
});

describe('requireSecret', () => {
  /**
   * A missing secret would otherwise sign every token with the string
   * "undefined" — self-consistent, verifiable, and forgeable by anyone who
   * notices.
   */
  it('refuses a missing or trivially short secret', () => {
    expect(() => requireSecret({} as Env, 'TOKEN_SECRET')).toThrow(/not configured/);
    expect(() => requireSecret({ TOKEN_SECRET: 'short' } as Env, 'TOKEN_SECRET')).toThrow(/not configured/);
  });

  it('accepts a real one', () => {
    expect(requireSecret({ TOKEN_SECRET: 'x'.repeat(32) } as Env, 'TOKEN_SECRET')).toHaveLength(32);
  });
});
