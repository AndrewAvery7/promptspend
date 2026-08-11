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

interface CacheEnvelope {
  cachedAt: string;
  health: unknown;
  pricing: unknown;
}

export interface MobileCatalogResult {
  catalog: Catalog;
  source: CatalogSource;
  refreshedAt: Date;
  warning: string | null;
}

interface LoadCatalogOptions {
  fetcher?: typeof fetch;
  now?: Date;
}

function validatedCatalog(pricing: unknown, health: unknown): Catalog {
  assertCatalog(pricing);
  return new Catalog(pricing, isSyncStatus(health) ? health : null);
}

async function readCache(): Promise<{ envelope: CacheEnvelope; catalog: Catalog } | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { File, Paths } = await import('expo-file-system');
    const cacheFile = new File(Paths.document, 'promptspend-pricing-v2.json');
    if (!cacheFile.exists) return null;
    const parsed: unknown = JSON.parse(await cacheFile.text());
    if (typeof parsed !== 'object' || parsed === null) return null;
    const envelope = parsed as Partial<CacheEnvelope>;
    if (typeof envelope.cachedAt !== 'string' || Number.isNaN(Date.parse(envelope.cachedAt))) return null;
    const completeEnvelope: CacheEnvelope = {
      cachedAt: envelope.cachedAt,
      health: envelope.health,
      pricing: envelope.pricing,
    };
    return {
      envelope: completeEnvelope,
      catalog: validatedCatalog(completeEnvelope.pricing, completeEnvelope.health),
    };
  } catch {
    return null;
  }
}

async function writeCache(envelope: CacheEnvelope): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { File, Paths } = await import('expo-file-system');
    const cacheFile = new File(Paths.document, 'promptspend-pricing-v2.json');
    cacheFile.write(JSON.stringify(envelope));
  } catch {
    // A read-only or full device must not prevent the estimator from working.
  }
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/**
 * Load a validated catalog without making startup depend on the network.
 *
 * A successful download is reused for 24 hours. If refresh fails, the last
 * valid cache remains usable; a bundled snapshot is the final offline fallback.
 */
export async function loadMobileCatalog(options: LoadCatalogOptions = {}): Promise<MobileCatalogResult> {
  const now = options.now ?? new Date();
  const cached = await readCache();
  const cachedAt = cached ? Date.parse(cached.envelope.cachedAt) : Number.NaN;
  const cacheIsFresh = cached !== null && now.getTime() - cachedAt < CACHE_TTL_MS;

  try {
    const fetcher = options.fetcher ?? fetch;
    const [pricing, health] = await Promise.all([
      fetchJson(PRICING_URL, fetcher),
      fetchJson(HEALTH_URL, fetcher).catch(() => null),
    ]);
    const catalog = validatedCatalog(pricing, health);
    const cachedAtIso = now.toISOString();
    await writeCache({ cachedAt: cachedAtIso, health, pricing: pricing as PricingCatalog });
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
