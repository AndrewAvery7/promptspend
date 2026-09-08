import {
  createPersistedLaunchState,
  parsePersistedLaunchState,
  type PersistedLaunchState,
} from './launchPersistence';

export const STORAGE_KEY = 'promptspend:launch:v1';
export const QUARANTINE_STORAGE_KEY = 'promptspend:launch:quarantine:v1';
export const RECOVERED_STORAGE_KEY = 'promptspend:launch:recovered:v1';

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const emptyState = () =>
  createPersistedLaunchState({ favorites: [], savedScenarios: [], onboardingComplete: false });

/** Serial transactions publish state only after the device acknowledges the write. */
export class DurableLaunchStore {
  private state = emptyState();
  private key = STORAGE_KEY;
  private ready = false;
  private blocked = false;
  private resetting = false;
  private loading: Promise<{ state: PersistedLaunchState; notice: string | null; blocked: boolean }> | null =
    null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: Storage) {}

  load(): Promise<{ state: PersistedLaunchState; notice: string | null; blocked: boolean }> {
    if (this.loading) return this.loading;
    this.loading = this.exclusive(() => this.read()).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.resetting) throw new Error('Storage recovery is already running. Please wait.');
    this.resetting = true;
    const task = this.queue.then(operation);
    this.queue = task.catch(() => undefined);
    try {
      return await task;
    } finally {
      this.resetting = false;
    }
  }

  private async read(): Promise<{ state: PersistedLaunchState; notice: string | null; blocked: boolean }> {
    this.ready = false;
    let raw: string | null = null;
    try {
      const recovered = await this.storage.getItem(RECOVERED_STORAGE_KEY);
      this.key = recovered === null ? STORAGE_KEY : RECOVERED_STORAGE_KEY;
      raw = recovered ?? (await this.storage.getItem(STORAGE_KEY));
      const parsed = raw === null ? emptyState() : parsePersistedLaunchState(JSON.parse(raw));
      if (!parsed) throw new Error('Unreadable saved state');
      this.state = parsed;
      this.blocked = false;
      return { state: this.state, notice: null, blocked: false };
    } catch {
      this.blocked = true;
      let copied = false;
      if (raw !== null) {
        try {
          // Never replace an earlier recovery copy with different data.
          const existing = await this.storage.getItem(QUARANTINE_STORAGE_KEY);
          if (existing === null) await this.storage.setItem(QUARANTINE_STORAGE_KEY, raw);
          copied = existing === null || existing === raw;
        } catch {
          /* The original stays untouched even if backup storage is full. */
        }
      }
      return {
        state: this.state,
        blocked: true,
        notice: `Saved data could not be read. The original has not been overwritten.${copied ? ' A recovery copy was preserved.' : ' A recovery copy could not be confirmed.'} Retry storage, or explicitly start a separate local save area.`,
      };
    } finally {
      this.ready = true;
    }
  }

  mutate(change: (state: PersistedLaunchState) => PersistedLaunchState): Promise<PersistedLaunchState> {
    if (this.resetting)
      return Promise.reject(new Error('Saved data is loading or recovering. Please try again shortly.'));
    if (!this.ready)
      return Promise.reject(new Error('Saved data is still loading. Please try again shortly.'));
    if (this.blocked)
      return Promise.reject(
        new Error('Saving is paused to protect unreadable data. Use the recovery options before saving.'),
      );
    const task = this.queue.then(async () => {
      if (this.blocked) throw new Error('Saving is paused to protect unreadable data.');
      const next = createPersistedLaunchState(change(this.state));
      await this.storage.setItem(this.key, JSON.stringify(next));
      this.state = next;
      return next;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  /** Explicit user recovery: use a separate key; retain both the original and quarantine. */
  startSeparateArea(): Promise<PersistedLaunchState> {
    return this.exclusive(() => this.createSeparateArea());
  }

  private async createSeparateArea(): Promise<PersistedLaunchState> {
    if (!this.ready) throw new Error('Saved data is still loading.');
    const existing = await this.storage.getItem(RECOVERED_STORAGE_KEY);
    if (existing !== null) {
      // An unreadable recovery area also stays recoverable before replacing it.
      await this.storage.setItem(`${QUARANTINE_STORAGE_KEY}:${Date.now()}`, existing);
    }
    const next = emptyState();
    await this.storage.setItem(RECOVERED_STORAGE_KEY, JSON.stringify(next));
    this.key = RECOVERED_STORAGE_KEY;
    this.state = next;
    this.blocked = false;
    return next;
  }
}
