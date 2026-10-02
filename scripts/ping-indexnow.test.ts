import { describe, expect, it } from 'vitest';
import type { PageLedger } from '@/lib/seo/ledger';
import { ledgerPaths } from './ping-indexnow';

const entry = (lastmod: string) => ({ published: '2026-08-02', lastmod, fingerprint: lastmod });

describe('ledgerPaths', () => {
  const previous: PageLedger = {
    '/models/': entry('2026-08-02'),
    '/models/gpt-5/': entry('2026-08-02'),
    '/models/o3/': entry('2026-08-02'),
    '/compare/a-vs-b/': entry('2026-08-02'),
  };

  it('submits only the pages whose lastmod moved, and the calculator with the model table', () => {
    const next: PageLedger = {
      ...previous,
      '/models/': entry('2026-09-01'),
      '/models/gpt-5/': entry('2026-09-01'),
    };
    expect(ledgerPaths(previous, next)).toEqual(['/', '/models/', '/models/gpt-5/']);
  });

  it('submits a page published for the first time', () => {
    const next: PageLedger = { ...previous, '/compare/c-vs-d/': entry('2026-09-01') };
    expect(ledgerPaths(previous, next)).toEqual(['/compare/c-vs-d/']);
  });

  it('submits nothing on a morning that re-verified prices without moving one', () => {
    expect(ledgerPaths(previous, { ...previous })).toEqual([]);
  });
});
