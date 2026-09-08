import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, render } from '@testing-library/react-native';
import { Catalog, type PricingCatalog } from '@promptspend/core';
import { StrictMode, useLayoutEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { loadMobileCatalog, MOBILE_CATALOG_MAX_AGE_MS, type MobileCatalogResult } from '@/data/catalog';
import { LaunchStateProvider, useLaunchState } from '@/state/useLaunchState';

jest.mock('@/data/catalog', () => ({
  ...jest.requireActual('@/data/catalog'),
  loadMobileCatalog: jest.fn(),
}));

const NOW = new Date('2026-08-31T12:00:00.000Z');
const pricing: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: NOW.toISOString(),
  providers: [{ id: 'test', name: 'Test', country: 'US' }],
  models: [
    {
      id: 'claude-sonnet-5',
      providerId: 'test',
      displayName: 'Test Model',
      status: 'current',
      contextWindow: 128_000,
      pricing: { input: 1, output: 2 },
      tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: false, vision: false },
      provenance: { source: 'vendor', lastVerified: '2026-08-31' },
    },
  ],
};
const catalog = new Catalog(pricing);
const load = jest.mocked(loadMobileCatalog);
let launch: ReturnType<typeof useLaunchState>;
const listeners = new Set<(state: AppStateStatus) => void>();

function result(refreshedAt = new Date(), warning: string | null = null): MobileCatalogResult {
  return { catalog, refreshedAt, warning, source: 'network' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const value = useLaunchState();
  useLayoutEffect(() => {
    launch = value;
  }, [value]);
  return <Text>{value.catalogResult ? 'prices available' : 'prices withheld'}</Text>;
}

async function mount() {
  const screen = await render(
    <LaunchStateProvider>
      <Probe />
    </LaunchStateProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return screen;
}

describe('mounted catalog freshness and refresh ordering', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    await AsyncStorage.clear();
    load.mockReset();
    load.mockResolvedValue(result(NOW));
    listeners.clear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    });
  });

  afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('withholds pricing at the deadline while the app stays mounted', async () => {
    load.mockResolvedValue(result(new Date(NOW.getTime() - MOBILE_CATALOG_MAX_AGE_MS + 1_000)));
    const screen = await mount();
    expect(screen.getByText('prices available')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText('prices withheld')).toBeTruthy();
    expect(launch.catalogResult).toBeNull();
    expect(launch.catalogError).toMatch(/expired/i);
    expect(() => launch.assertCurrentPricing()).toThrow(/unavailable or expired/i);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('StrictMode replay does not leave hydration blocked or reject a duplicate load', async () => {
    await render(
      <StrictMode>
        <LaunchStateProvider>
          <Probe />
        </LaunchStateProvider>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(launch.hydrated).toBe(true);
    expect(launch.persistenceBlocked).toBe(false);
    expect(launch.persistenceNotice).toBeNull();
    expect(launch.catalogResult).not.toBeNull();
  });

  test('UTC midnight updates pricingDay without discarding still-current catalog', async () => {
    const beforeMidnight = new Date('2026-08-31T23:59:59.000Z');
    jest.setSystemTime(beforeMidnight);
    load.mockResolvedValue(result(beforeMidnight));
    await mount();
    expect(launch.pricingDay).toBe('2026-08-31');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(launch.pricingDay).toBe('2026-09-01');
    expect(launch.catalogResult).not.toBeNull();
    expect(() => launch.assertCurrentPricing()).not.toThrow();
  });

  test('action-time check refuses expired pricing before suspended timers resume', async () => {
    await mount();
    jest.setSystemTime(new Date(NOW.getTime() + MOBILE_CATALOG_MAX_AGE_MS));
    expect(() => launch.assertCurrentPricing()).toThrow(/expired/i);
  });

  test("action-time date guard requests rerender before sharing yesterday's promotion", async () => {
    const beforeMidnight = new Date('2026-08-31T23:59:59.000Z');
    jest.setSystemTime(beforeMidnight);
    load.mockResolvedValue(result(beforeMidnight));
    await mount();
    jest.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    await act(async () => {
      expect(() => launch.assertCurrentPricing()).toThrow(/pricing date has changed/i);
    });
    expect(launch.pricingDay).toBe('2026-09-01');
    expect(() => launch.assertCurrentPricing()).not.toThrow();
  });

  test('foreground return hides expired values while a new refresh is still pending', async () => {
    const screen = await mount();
    await act(async () => {
      for (const listener of [...listeners]) listener('background');
    });
    jest.setSystemTime(new Date(NOW.getTime() + MOBILE_CATALOG_MAX_AGE_MS + 1));
    const pending = deferred<MobileCatalogResult>();
    load.mockImplementationOnce(() => pending.promise);
    await act(async () => {
      for (const listener of [...listeners]) listener('active');
    });
    expect(screen.getByText('prices withheld')).toBeTruthy();
    expect(launch.refreshing).toBe(true);
    expect(() => launch.assertCurrentPricing()).toThrow(/expired/i);
    const refreshed = result(new Date());
    await act(async () => {
      pending.resolve(refreshed);
      await pending.promise;
    });
    expect(launch.catalogResult).toEqual(refreshed);
    expect(launch.refreshing).toBe(false);
  });

  test('late older failure cannot replace the newer successful refresh', async () => {
    await mount();
    const older = deferred<MobileCatalogResult>();
    const newer = deferred<MobileCatalogResult>();
    load.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = launch.refreshCatalog();
      second = launch.refreshCatalog();
    });
    const newest = result(NOW, 'newer result');
    await act(async () => {
      newer.resolve(newest);
      await second;
    });
    await act(async () => {
      older.reject(new Error('older request failed'));
      await first;
    });
    expect(launch.catalogResult).toEqual(newest);
    expect(launch.catalogError).toBeNull();
    expect(launch.refreshing).toBe(false);
  });

  test('late older success cannot replace the latest accepted refresh', async () => {
    await mount();
    const older = deferred<MobileCatalogResult>();
    const newer = deferred<MobileCatalogResult>();
    load.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = launch.refreshCatalog();
      second = launch.refreshCatalog();
    });
    const newest = result(NOW, 'newer result');
    await act(async () => {
      newer.resolve(newest);
      await second;
    });
    await act(async () => {
      older.resolve(result(NOW, 'older result'));
      await first;
    });
    expect(launch.catalogResult).toEqual(newest);
  });
});
