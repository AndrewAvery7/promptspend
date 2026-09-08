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
export const MOBILE_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MOBILE_CATALOG_TIMEOUT_MS = 8_000;

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
  /** A clock, rather than a request-start snapshot, lets fallback recheck age. */
  now?: Date | (() => Date);
  timeoutMs?: number;
}

export function isMobileCatalogFresh(refreshedAt: Date | null | undefined, now = new Date()): boolean {
  if (!refreshedAt) return false;
  const age = now.getTime() - refreshedAt.getTime();
  return Number.isFinite(age) && age >= 0 && age < MOBILE_CATALOG_MAX_AGE_MS;
}

function validatedCatalog(pricing: unknown, health: unknown): Catalog {
  assertCatalog(pricing);
  const catalog = new Catalog(pricing, isSyncStatus(health) ? health : null);
  if (catalog.primaryModels.length === 0) throw new Error('Catalog has no primary models');
  // Schema validation checks that targets exist, but cannot by itself ensure
  // aliases ultimately lead to a primary model rather than form a cycle.
  for (const model of catalog.models) {
    const visited = new Set<string>();
    let current = model;
    while (current.aliasOf !== undefined) {
      if (visited.has(current.id)) throw new Error('Catalog contains cyclic model aliases');
      visited.add(current.id);
      const target = catalog.get(current.aliasOf);
      if (!target) throw new Error('Catalog contains an unresolved model alias');
      current = target;
    }
  }
  return catalog;
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
    const cacheFile = new File(Paths.cache, 'promptspend-pricing-v2.json');
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
    const cacheFile = new File(Paths.cache, 'promptspend-pricing-v2.json');
    cacheFile.write(JSON.stringify(envelope));
  } catch {
    // A read-only or full device must not prevent the estimator from working.
  }
}

const DEVICE_CACHE: MobileCatalogCache = {
  read: readDeviceCache,
  write: writeDeviceCache,
};

async function fetchJson(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timed out'));
    }, timeoutMs);
  });

  try {
    // Keep the deadline alive until the body has also been downloaded and
    // decoded. Receiving headers does not mean a response has finished.
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { cache: 'no-cache', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as unknown;
      })(),
      timeoutPromise,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Load a validated catalog without making startup depend on the network.
 *
 * A successful download is reused for up to 24 hours. If refresh fails, only a
 * still-current validated cache remains usable. Older prices fail closed.
 */
export async function loadMobileCatalog(options: LoadCatalogOptions = {}): Promise<MobileCatalogResult> {
  const configuredNow = options.now;
  const clock = typeof configuredNow === 'function' ? configuredNow : () => configuredNow ?? new Date();
  const cache = options.cache ?? DEVICE_CACHE;
  // An inaccessible cache must not prevent a successful live download.
  const cached = await cache.read().catch(() => null);

  try {
    const fetcher = options.fetcher ?? fetch;
    const timeoutMs = options.timeoutMs ?? MOBILE_CATALOG_TIMEOUT_MS;
    const [pricing, health] = await Promise.all([
      fetchJson(PRICING_URL, fetcher, timeoutMs),
      fetchJson(HEALTH_URL, fetcher, timeoutMs).catch(() => null),
    ]);
    const catalog = validatedCatalog(pricing, health);
    const now = clock();
    const cachedAtIso = now.toISOString();
    // Cache writes are best effort: usable, freshly validated network data
    // must not be replaced with old data just because the disk is full.
    await cache
      .write({ cachedAt: cachedAtIso, health, pricing: pricing as PricingCatalog })
      .catch(() => undefined);
    const freshness = catalog.freshness(now);
    const warning =
      freshness.level === 'unknown'
        ? 'Current prices loaded, but source-check freshness evidence is unavailable.'
        : freshness.level === 'stale'
          ? 'The pricing sync reports stale or degraded source-check evidence. Review the date before relying on this estimate.'
          : null;
    return { catalog, source: 'network', refreshedAt: now, warning };
  } catch {
    if (cached && isMobileCatalogFresh(new Date(cached.envelope.cachedAt), clock())) {
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
