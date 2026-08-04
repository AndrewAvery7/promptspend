import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PricingCatalog } from '@/lib/pricing/types';
import { CatalogSource, GRACE_MS } from './catalog';
import { PricingService, statusBarText } from './service';
import { DEFAULT_SETTINGS, shouldAnnotate } from './config';

const raw = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
) as PricingCatalog;

const serviceWith = (fetcher = vi.fn(async () => raw)) => ({
  service: new PricingService(new CatalogSource(fetcher)),
  fetcher,
});

describe('PricingService', () => {
  it('finds models once the catalog is ready', async () => {
    const { service } = serviceWith();
    const outcome = await service.scan('model="claude-sonnet-5"', {}, 0);
    expect(outcome.state.status).toBe('ready');
    expect(outcome.matches.map((m) => m.written)).toEqual(['claude-sonnet-5']);
  });

  it('returns no matches at all when the catalog is unavailable', async () => {
    // The load-bearing behaviour: an unreachable catalog must produce silence,
    // not a guess. There is no bundled copy to fall back to by design.
    const { service } = serviceWith(vi.fn(async () => Promise.reject(new Error('offline'))));
    const outcome = await service.scan('model="claude-sonnet-5"', {}, 0);
    expect(outcome.state.status).toBe('unavailable');
    expect(outcome.matches).toEqual([]);
  });

  it('stops matching once a stale catalog passes the grace period', async () => {
    const fetcher = vi.fn(async () => raw);
    const { service } = serviceWith(fetcher);
    expect((await service.scan('"gpt-5"', {}, 0)).matches).toHaveLength(1);

    fetcher.mockRejectedValue(new Error('offline'));
    expect((await service.scan('"gpt-5"', {}, GRACE_MS)).matches).toEqual([]);
  });

  it('rebuilds the index only when the catalog generation changes', async () => {
    // Guards the performance decision. If this starts failing, the regex is
    // being recompiled per scan and typing in a large file will stutter.
    const fetcher = vi.fn(async () => raw);
    const { service } = serviceWith(fetcher);

    const first = await service.scan('"gpt-5"', {}, 0);
    const second = await service.scan('"gpt-5"', {}, 1);
    expect(first.matches[0]?.model).toBe(second.matches[0]?.model);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('statusBarText', () => {
  it('shows the generation date when all is well', () => {
    const bar = statusBarText({
      status: 'ready',
      catalog: null as never,
      generatedAt: '2026-08-03T18:13:06.015Z',
      ageing: false,
    });
    expect(bar.text).toContain('2026-08-03');
    expect(bar.warning).toBe(false);
  });

  it('warns when refreshes are failing but the copy is still usable', () => {
    const bar = statusBarText({
      status: 'ready',
      catalog: null as never,
      generatedAt: '2026-08-03T18:13:06.015Z',
      ageing: true,
    });
    expect(bar.warning).toBe(true);
    expect(bar.tooltip).toContain('refresh is failing');
  });

  it('says plainly that there are no prices when there are none', () => {
    const bar = statusBarText({ status: 'unavailable', reason: 'ENOTFOUND' });
    expect(bar.text).toContain('no prices');
    expect(bar.tooltip).toBe('ENOTFOUND');
    expect(bar.warning).toBe(true);
  });
});

describe('language allowlist', () => {
  it('annotates source languages', () => {
    for (const language of ['python', 'typescript', 'yaml', 'go']) {
      expect(shouldAnnotate(language, DEFAULT_SETTINGS), language).toBe(true);
    }
  });

  it('leaves prose alone', () => {
    // The other half of scan.test.ts's "DOES match a model named in prose".
    // Together they are the whole story: the scanner matches, the allowlist is
    // what stops a changelog lighting up.
    for (const language of ['markdown', 'plaintext', 'log', 'git-commit']) {
      expect(shouldAnnotate(language, DEFAULT_SETTINGS), language).toBe(false);
    }
  });
});
