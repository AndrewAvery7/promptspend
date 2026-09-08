import {
  DurableLaunchStore,
  QUARANTINE_STORAGE_KEY,
  RECOVERED_STORAGE_KEY,
  STORAGE_KEY,
} from '@/state/durableLaunchStore';
import { createPersistedLaunchState } from '@/state/launchPersistence';

function memoryStorage(entries: [string, string][] = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const stateWith = (favorites: string[] = []) =>
  createPersistedLaunchState({
    favorites,
    savedScenarios: [],
    onboardingComplete: false,
  });

describe('DurableLaunchStore acknowledgement and recovery', () => {
  test('empty successful hydration does not write an empty state prematurely', async () => {
    const storage = memoryStorage();
    const result = await new DurableLaunchStore(storage).load();
    expect(result).toEqual({ state: stateWith(), notice: null, blocked: false });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('rejects saves before hydration and while a storage read is pending', async () => {
    const storage = memoryStorage();
    const pendingRead = deferred<string | null>();
    storage.getItem.mockImplementationOnce(() => pendingRead.promise);
    const store = new DurableLaunchStore(storage);
    await expect(store.mutate(() => stateWith(['too-early']))).rejects.toThrow(/still loading/i);
    const loading = store.load();
    await expect(store.mutate(() => stateWith(['still-too-early']))).rejects.toThrow(/loading/i);
    pendingRead.resolve(null);
    await loading;
    expect(storage.setItem).not.toHaveBeenCalled();
    await expect(store.mutate(() => stateWith(['ready']))).resolves.toEqual(stateWith(['ready']));
  });

  test('concurrent hydration loads coalesce onto the same acknowledged read', async () => {
    const storage = memoryStorage([[STORAGE_KEY, JSON.stringify(stateWith(['retained']))]]);
    const read = deferred<string | null>();
    storage.getItem.mockImplementationOnce(() => read.promise);
    const store = new DurableLaunchStore(storage);
    const first = store.load();
    const replay = store.load();
    expect(replay).toBe(first);
    read.resolve(null);
    const [one, two] = await Promise.all([first, replay]);
    expect(one.state.favorites).toEqual(['retained']);
    expect(two).toEqual(one);
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('a read error blocks writes without inventing a confirmed recovery copy', async () => {
    const original = JSON.stringify(stateWith(['keep']));
    const storage = memoryStorage([[STORAGE_KEY, original]]);
    storage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));
    const store = new DurableLaunchStore(storage);
    const result = await store.load();
    expect(result.blocked).toBe(true);
    expect(result.notice).toMatch(/recovery copy could not be confirmed/i);
    expect(storage.setItem).not.toHaveBeenCalled();
    await expect(store.mutate(() => stateWith(['replacement']))).rejects.toThrow(/protect unreadable data/i);
    expect(storage.values.get(STORAGE_KEY)).toBe(original);
  });

  test('corrupt JSON is preserved in the original and a confirmed quarantine copy', async () => {
    const original = '{broken';
    const storage = memoryStorage([[STORAGE_KEY, original]]);
    const store = new DurableLaunchStore(storage);
    const result = await store.load();
    expect(result.blocked).toBe(true);
    expect(result.notice).toMatch(/a recovery copy was preserved/i);
    expect(storage.values.get(STORAGE_KEY)).toBe(original);
    expect(storage.values.get(QUARANTINE_STORAGE_KEY)).toBe(original);
    await expect(store.mutate(() => stateWith(['new']))).rejects.toThrow(/saving is paused/i);
  });

  test('failed quarantine backup reports uncertainty and leaves the original intact', async () => {
    const original = '{broken';
    const storage = memoryStorage([[STORAGE_KEY, original]]);
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const result = await new DurableLaunchStore(storage).load();
    expect(result.blocked).toBe(true);
    expect(result.notice).toMatch(/recovery copy could not be confirmed/i);
    expect(result.notice).not.toMatch(/recovery copy was preserved/i);
    expect(storage.values.get(STORAGE_KEY)).toBe(original);
    expect(storage.values.has(QUARANTINE_STORAGE_KEY)).toBe(false);
  });

  test('does not overwrite an earlier different quarantine copy', async () => {
    const storage = memoryStorage([
      [STORAGE_KEY, '{new-broken'],
      [QUARANTINE_STORAGE_KEY, '{old-broken'],
    ]);
    const result = await new DurableLaunchStore(storage).load();
    expect(result.notice).toMatch(/recovery copy could not be confirmed/i);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(QUARANTINE_STORAGE_KEY)).toBe('{old-broken');
  });

  test('explicit separate-area recovery preserves both old copies and survives relaunch', async () => {
    const original = '{broken';
    const storage = memoryStorage([[STORAGE_KEY, original]]);
    const store = new DurableLaunchStore(storage);
    await store.load();
    await expect(store.startSeparateArea()).resolves.toEqual(stateWith());
    const saved = await store.mutate(() => stateWith(['new-model']));
    expect(saved.favorites).toEqual(['new-model']);
    expect(storage.values.get(STORAGE_KEY)).toBe(original);
    expect(storage.values.get(QUARANTINE_STORAGE_KEY)).toBe(original);
    expect(JSON.parse(storage.values.get(RECOVERED_STORAGE_KEY)!)).toEqual(saved);
    const reloaded = await new DurableLaunchStore(storage).load();
    expect(reloaded.blocked).toBe(false);
    expect(reloaded.state).toEqual(saved);
  });

  test('a failed separate-area write does not unblock saving or claim recovery', async () => {
    const storage = memoryStorage([[STORAGE_KEY, '{broken']]);
    const store = new DurableLaunchStore(storage);
    await store.load();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(store.startSeparateArea()).rejects.toThrow('disk full');
    await expect(store.mutate(() => stateWith(['unsafe']))).rejects.toThrow(/saving is paused/i);
    expect(storage.values.get(STORAGE_KEY)).toBe('{broken');
    expect(storage.values.has(RECOVERED_STORAGE_KEY)).toBe(false);
  });

  test('unreadable recovered area is backed up before explicit replacement', async () => {
    const storage = memoryStorage([
      [STORAGE_KEY, '{original'],
      [RECOVERED_STORAGE_KEY, '{broken-recovered'],
    ]);
    const store = new DurableLaunchStore(storage);
    await store.load();
    await store.startSeparateArea();
    const recoveryBackups = [...storage.values.entries()].filter(([key]) =>
      key.startsWith(`${QUARANTINE_STORAGE_KEY}:`),
    );
    expect(recoveryBackups).toHaveLength(1);
    expect(recoveryBackups[0][1]).toBe('{broken-recovered');
    expect(storage.values.get(STORAGE_KEY)).toBe('{original');
    expect(JSON.parse(storage.values.get(RECOVERED_STORAGE_KEY)!)).toEqual(stateWith());
  });

  test('mutation promises resolve only after writes, with rapid updates in order', async () => {
    const storage = memoryStorage();
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    storage.setItem
      .mockImplementationOnce(async (key, value) => {
        await firstWrite.promise;
        storage.values.set(key, value);
      })
      .mockImplementationOnce(async (key, value) => {
        await secondWrite.promise;
        storage.values.set(key, value);
      });
    const store = new DurableLaunchStore(storage);
    await store.load();
    const acknowledged: string[] = [];
    const first = store
      .mutate((state) => ({ ...state, favorites: [...state.favorites, 'first'] }))
      .then((state) => {
        acknowledged.push('first');
        return state;
      });
    const second = store
      .mutate((state) => ({ ...state, favorites: [...state.favorites, 'second'] }))
      .then((state) => {
        acknowledged.push('second');
        return state;
      });
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(acknowledged).toEqual([]);
    expect(storage.values.has(STORAGE_KEY)).toBe(false);
    firstWrite.resolve();
    expect((await first).favorites).toEqual(['first']);
    expect(acknowledged).toEqual(['first']);
    secondWrite.resolve();
    expect((await second).favorites).toEqual(['first', 'second']);
    expect(acknowledged).toEqual(['first', 'second']);
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(stateWith(['first', 'second']));
  });

  test('failed writes do not poison the queue or enter the next acknowledged state', async () => {
    const storage = memoryStorage([[STORAGE_KEY, JSON.stringify(stateWith(['original']))]]);
    const store = new DurableLaunchStore(storage);
    await store.load();
    storage.setItem.mockRejectedValueOnce(new Error('full device'));
    const failed = store.mutate((state) => ({ ...state, favorites: [...state.favorites, 'not-saved'] }));
    const retry = store.mutate((state) => ({ ...state, favorites: [...state.favorites, 'saved-on-retry'] }));
    await expect(failed).rejects.toThrow('full device');
    expect((await retry).favorites).toEqual(['original', 'saved-on-retry']);
    const reloaded = await new DurableLaunchStore(storage).load();
    expect(reloaded.state.favorites).toEqual(['original', 'saved-on-retry']);
  });

  test('concurrent recovery, retry, and new mutations cannot race the separate-area reset', async () => {
    const storage = memoryStorage([[STORAGE_KEY, '{broken']]);
    const store = new DurableLaunchStore(storage);
    await store.load();
    const write = deferred<void>();
    storage.setItem.mockImplementationOnce(async (key, value) => {
      await write.promise;
      storage.values.set(key, value);
    });
    const recovering = store.startSeparateArea();
    await expect(store.startSeparateArea()).rejects.toThrow(/already running/i);
    await expect(store.load()).rejects.toThrow(/already running/i);
    await expect(store.mutate(() => stateWith(['during-reset']))).rejects.toThrow(/recovering/i);
    write.resolve();
    await recovering;
    await expect(store.mutate(() => stateWith(['after-reset']))).resolves.toEqual(stateWith(['after-reset']));
    expect(JSON.parse(storage.values.get(RECOVERED_STORAGE_KEY)!)).toEqual(stateWith(['after-reset']));
    expect(storage.values.get(STORAGE_KEY)).toBe('{broken');
  });

  test('retry waits for an earlier write and reads its acknowledged state', async () => {
    const storage = memoryStorage();
    const store = new DurableLaunchStore(storage);
    await store.load();
    const write = deferred<void>();
    storage.setItem.mockImplementationOnce(async (key, value) => {
      await write.promise;
      storage.values.set(key, value);
    });
    const saving = store.mutate(() => stateWith(['acknowledged']));
    const retrying = store.load();
    await expect(store.mutate(() => stateWith(['during-retry']))).rejects.toThrow(/loading/i);
    write.resolve();
    await saving;
    expect((await retrying).state).toEqual(stateWith(['acknowledged']));
  });
});
