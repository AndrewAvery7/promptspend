/**
 * The key events PromptSpend's website sends to Google Analytics, and the
 * one way they are sent.
 *
 * This module never loads Google Analytics; `ga.ts` does that. It only queues
 * an event when Google Analytics is already running on the page, so it is safe
 * to import from website components and state. Every value it sends is a fixed
 * label or a catalog model id, never text a visitor typed or pasted.
 */
import { GA_MEASUREMENT_ID } from './config';

/** The page globals `gtag.js` reads. */
export interface GtagWindow {
  dataLayer?: unknown[];
  [disableFlag: `ga-disable-${string}`]: boolean | undefined;
}

/** Google's documented off switch for this Measurement ID. */
export const DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}` as const;

/**
 * A function that queues one `gtag` command. `gtag.js` reads each queued
 * command as an `arguments` object, not an array, which is why this is the
 * one place a rest parameter will not do.
 */
export function queueOn(layer: unknown[]): (...command: unknown[]) => void {
  return function gtag(..._command: unknown[]): void {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
}

/** The tools whose install or call commands have a Copy button. */
export const INSTALL_TOOLS = ['mcp', 'api', 'vscode'] as const;
export type InstallTool = (typeof INSTALL_TOOLS)[number];

/**
 * The key events PromptSpend's own code sends, on top of Google's automatic
 * ones. Every value is a fixed label or a catalog model id, never text a
 * visitor typed or pasted.
 */
export type KeyEvent =
  | { name: 'store_click'; store: 'app_store' | 'google_play' }
  | { name: 'install_copy'; tool: InstallTool }
  | { name: 'model_added'; model_id: string };

/** Which store an address points at, or null for any other address. */
export function storeForAddress(address: string): 'app_store' | 'google_play' | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname === 'apps.apple.com') return 'app_store';
  if (url.hostname === 'play.google.com' && url.pathname.startsWith('/store/apps/')) return 'google_play';
  return null;
}

/**
 * The key event a click stands for, if any: a link to either app store, or a
 * Copy button marked with `data-ga-install`.
 */
export function keyEventForClick(target: EventTarget | null): KeyEvent | null {
  if (!(target instanceof Element)) return null;
  const copy = target.closest('[data-ga-install]');
  if (copy) {
    const tool = copy.getAttribute('data-ga-install');
    return INSTALL_TOOLS.includes(tool as InstallTool)
      ? { name: 'install_copy', tool: tool as InstallTool }
      : null;
  }
  const link = target.closest('a[href]');
  const store = link instanceof HTMLAnchorElement ? storeForAddress(link.href) : null;
  return store ? { name: 'store_click', store } : null;
}

/**
 * Send one key event, but only when Google Analytics is running on this page:
 * loaded, and not switched off since. Otherwise nothing is queued at all.
 */
export function sendKeyEvent(win: GtagWindow, keyEvent: KeyEvent): void {
  if (win[DISABLE_FLAG] !== false || !win.dataLayer) return;
  const { name, ...params } = keyEvent;
  queueOn(win.dataLayer)('event', name, params);
}

/** `sendKeyEvent` for code that has no window handy (React state, mostly). */
export function trackKeyEvent(keyEvent: KeyEvent): void {
  if (typeof window !== 'undefined') sendKeyEvent(window as unknown as GtagWindow, keyEvent);
}
