import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PricingCatalog } from '@/lib/pricing/types';
import { CatalogSource, FRESH_MS, GRACE_MS } from './catalog';

const raw = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
) as PricingCatalog;

const ok = () => vi.fn(async () => raw);
const fails = () => vi.fn(async () => Promise.reject(new Error('ENOTFOUND')));

describe('a reachable catalog', () => {
  it('is ready and not ageing on first fetch', async () => {
    const source = new CatalogSource(ok());
    const state = await source.get(0);
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.ageing).toBe(false);
    expect(state.generatedAt).toBe(raw.generatedAt);
  });

  it('does not refetch inside the freshness window', async () => {
    const fetcher = ok();
    const source = new CatalogSource(fetcher);
    await source.get(0);
    await source.get(FRESH_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches once the window has passed', async () => {
    const fetcher = ok();
    const source = new CatalogSource(fetcher);
    await source.get(0);
    await source.get(FRESH_MS + 1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    // The hover, the decorations and the diagnostics all ask on the same
    // keystroke. Three fetches for one answer would triple the traffic.
    const fetcher = ok();
    const source = new CatalogSource(fetcher);
    await Promise.all([source.get(0), source.get(0), source.get(0)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('an unreachable catalog', () => {
  it('is unavailable rather than empty when it has never been fetched', async () => {
    const state = await new CatalogSource(fails()).get(0);
    expect(state.status).toBe('unavailable');
    if (state.status !== 'unavailable') return;
    expect(state.reason).toContain('ENOTFOUND');
  });

  it('keeps serving a cached copy inside the grace period, marked ageing', async () => {
    const fetcher = vi.fn(async () => raw);
    const source = new CatalogSource(fetcher);
    await source.get(0);

    fetcher.mockRejectedValueOnce(new Error('offline'));
    const state = await source.get(FRESH_MS + 1);

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.ageing).toBe(true);
  });

  it('withholds prices entirely once the grace period has passed', async () => {
    // The load-bearing test for the whole design. Past a day of failed
    // refreshes the answer must be "unavailable", never a stale number.
    const fetcher = vi.fn(async () => raw);
    const source = new CatalogSource(fetcher);
    await source.get(0);

    fetcher.mockRejectedValue(new Error('offline'));
    const state = await source.get(GRACE_MS);

    expect(state.status).toBe('unavailable');
    if (state.status !== 'unavailable') return;
    expect(state.reason).toContain('rather than shown out of date');
  });

  it('does not discard a good catalog because one request failed', async () => {
    const fetcher = vi.fn(async () => raw);
    const source = new CatalogSource(fetcher);
    await source.get(0);

    fetcher.mockRejectedValueOnce(new Error('flaky'));
    await source.get(FRESH_MS + 1);

    fetcher.mockResolvedValue(raw);
    const recovered = await source.get(FRESH_MS * 2 + 2);
    expect(recovered.status).toBe('ready');
    if (recovered.status !== 'ready') return;
    expect(recovered.ageing).toBe(false);
  });
});

describe('rejecting a malformed response', () => {
  it('treats a reshaped body as unavailable, not as an empty catalog', async () => {
    // Runtime validation matters more here than in most places: an editor that
    // silently found "no models" would look identical to a clean file.
    const source = new CatalogSource(vi.fn(async () => ({ nonsense: true }) as unknown as PricingCatalog));
    const state = await source.get(0);
    expect(state.status).toBe('unavailable');
  });
});

describe('peek', () => {
  it('reports the state without triggering a fetch', async () => {
    const fetcher = ok();
    const source = new CatalogSource(fetcher);
    expect(source.peek(0).status).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();

    await source.get(0);
    expect(source.peek(0).status).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
