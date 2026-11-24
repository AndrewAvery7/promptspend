import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_MOUNT_CLASS, appContainer, removeStaticShell, staticShellPainted } from './static-shell';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('appContainer and removeStaticShell', () => {
  it('renders into #root itself when the build drew nothing there', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;
    expect(appContainer(root)).toEqual({ container: root, hasStaticShell: false });
  });

  it('renders beside a pre-drawn shell, then removes the shell and the static footer only', () => {
    document.body.innerHTML =
      '<div id="root"><div class="home-shell"><h1>Hero</h1></div><footer class="footer">Badges</footer></div>';
    const root = document.getElementById('root')!;
    const { container, hasStaticShell } = appContainer(root);

    expect(hasStaticShell).toBe(true);
    expect(container.className).toBe(APP_MOUNT_CLASS);
    expect(root.lastElementChild).toBe(container);
    expect(root.children).toHaveLength(3);

    container.innerHTML = '<main>App</main>';
    removeStaticShell();
    expect([...root.children]).toEqual([container]);
    expect(root.textContent).toBe('App');
  });
});

describe('staticShellPainted', () => {
  it('gives up after its timeout rather than holding the app back for ever', async () => {
    vi.useFakeTimers();
    // Faces that never finish loading, and no paint report (as in Safari).
    const stuck = { fonts: { load: () => new Promise<never>(() => undefined) }, defaultView: window };
    let done = false;
    void staticShellPainted(stuck as unknown as Document, 3000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
