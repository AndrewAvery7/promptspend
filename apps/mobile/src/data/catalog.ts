import {
  Catalog,
  assertCatalog,
  isSyncStatus,
  type PricingCatalog,
  type SyncStatus,
} from '@promptspend/core';
import { Platform } from 'react-native';

const PRICING_URL = 'https://promptspend.com/data/pricing.json';
const HEALTH_URL = 'https://promptspend.com/data/sync-status.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CatalogSource = 'network' | 'cache';

export interface CacheEnvelope {
  cachedAt: string;
  health: unknown;
  pricing: unknown;
}

export interface MobileCatalogCache {
  read(): Promise<{ envelope: CacheEnvelope; catalog: Catalog } | null>;
  write(envelope: CacheEnvelope): Promise<void>;
}

export interface MobileCatalogResult {
  catalog: Catalog;
  source: CatalogSource;
  refreshedAt: Date;
  warning: string | null;
}

interface LoadCatalogOptions {
  cache?: MobileCatalogCache;
  fetcher?: typeof fetch;
  now?: Date;
}

function validatedCatalog(pricing: unknown, health: unknown): Catalog {
  assertCatalog(pricing);
  return new Catalog(pricing, isSyncStatus(health) ? health : null);
}

export function parseCacheRecord(value: unknown): { envelope: CacheEnvelope; catalog: Catalog } | null {
  if (typeof value !== 'object' || value === null) return null;
  const envelope = value as Partial<CacheEnvelope>;
  if (typeof envelope.cachedAt !== 'string' || Number.isNaN(Date.parse(envelope.cachedAt))) return null;
  const completeEnvelope: CacheEnvelope = {
    cachedAt: envelope.cachedAt,
    health: envelope.health,
    pricing: envelope.pricing,
  };
  try {
    return {
      envelope: completeEnvelope,
      catalog: validatedCatalog(completeEnvelope.pricing, completeEnvelope.health),
    };
  } catch {
    return null;
  }
}

async function readDeviceCache(): Promise<{ envelope: CacheEnvelope; catalog: Catalog } | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { File, Paths } = await import('expo-file-system');
    const cacheFile = new File(Paths.document, 'promptspend-pricing-v2.json');
    if (!cacheFile.exists) return null;
    const parsed: unknown = JSON.parse(await cacheFile.text());
    return parseCacheRecord(parsed);
  } catch {
    return null;
  }
}

async function writeDeviceCache(envelope: CacheEnvelope): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { File, Paths } = await import('expo-file-system');
    const cacheFile = new File(Paths.document, 'promptspend-pricing-v2.json');
    cacheFile.write(JSON.stringify(envelope));
  } catch {
    // A read-only or full device must not prevent the estimator from working.
  }
}

const DEVICE_CACHE: MobileCatalogCache = {
  read: readDeviceCache,
  write: writeDeviceCache,
};

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/**
 * Load a validated catalog without making startup depend on the network.
 *
 * A successful download is reused for up to 24 hours. If refresh fails, only a
 * still-current validated cache remains usable. Older prices fail closed.
 */
export async function loadMobileCatalog(options: LoadCatalogOptions = {}): Promise<MobileCatalogResult> {
  const now = options.now ?? new Date();
  const cache = options.cache ?? DEVICE_CACHE;
  const cached = await cache.read();
  const cachedAt = cached ? Date.parse(cached.envelope.cachedAt) : Number.NaN;
  const cacheAge = now.getTime() - cachedAt;
  const cacheIsFresh = cached !== null && cacheAge >= 0 && cacheAge < CACHE_TTL_MS;

  try {
    const fetcher = options.fetcher ?? fetch;
    const [pricing, health] = await Promise.all([
      fetchJson(PRICING_URL, fetcher),
      fetchJson(HEALTH_URL, fetcher).catch(() => null),
    ]);
    const catalog = validatedCatalog(pricing, health);
    const cachedAtIso = now.toISOString();
    await cache.write({ cachedAt: cachedAtIso, health, pricing: pricing as PricingCatalog });
    const freshness = catalog.freshness(now);
    const warning =
      freshness.level === 'unknown'
        ? 'Current prices loaded, but source-check freshness evidence is unavailable.'
        : freshness.level === 'stale'
          ? 'The pricing sync reports stale or degraded source-check evidence. Review the date before relying on this estimate.'
          : null;
    return { catalog, source: 'network', refreshedAt: now, warning };
  } catch {
    if (cached && cacheIsFresh) {
      return {
        catalog: cached.catalog,
        source: 'cache',
        refreshedAt: new Date(cached.envelope.cachedAt),
        warning: 'Live prices could not be refreshed. Showing the last validated download.',
      };
    }
    throw new Error('Pricing is unavailable until PromptSpend can download a current validated catalog.');
  }
}

export type { CatalogSource, SyncStatus };
