import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterAppReady, markAppReady, resetAppReadyForTests } from './app-ready';

beforeEach(() => {
  vi.useFakeTimers();
  resetAppReadyForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('afterAppReady', () => {
  it('waits for the app, then runs once after a paint', () => {
    const task = vi.fn();
    afterAppReady(task);
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();

    markAppReady();
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);

    markAppReady();
    vi.advanceTimersByTime(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs straight after a paint when the app is already ready', () => {
    markAppReady();
    const task = vi.fn();
    afterAppReady(task);
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs anyway after the fallback when the app never says it is ready', () => {
    const task = vi.fn();
    afterAppReady(task, 3000);
    vi.advanceTimersByTime(2999);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    markAppReady();
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
