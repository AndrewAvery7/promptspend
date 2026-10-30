import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * App usage statistics, reported to the PromptSpend Google Analytics property
 * through Firebase Analytics.
 *
 * Only two kinds of thing are ever sent: which screen is open, and one of the
 * fixed events below. Every value is checked against a closed list at runtime,
 * so nothing a person types or pastes can reach Google even by mistake.
 *
 * firebase.json switches collection off at launch and blocks advertising IDs.
 * Collection starts only after the saved choice is read, so a person who
 * turned statistics off sends nothing at all, not even the first screen.
 */

export const USAGE_STATS_STORAGE_KEY = 'promptspend.usageStats.v1';

export const USAGE_SCREENS = ['home', 'estimate', 'compare', 'data', 'learn', 'receipt'] as const;
export type UsageScreen = (typeof USAGE_SCREENS)[number];

export const SHARE_CONTENT = [
  'estimate',
  'comparison',
  'estimate_receipt',
  'conversation_receipt',
  'scenario',
  'audit_instructions',
] as const;
export const SHARE_METHODS = ['text', 'image', 'csv'] as const;
export const LINK_NAMES = [
  'privacy',
  'support',
  'support_email',
  'source_code',
  'sync_status',
  'developer_hub',
  'mcp',
  'vscode',
  'open_vsx',
  'market_report',
  'receipt_page',
  'other',
] as const;

export type ShareContent = (typeof SHARE_CONTENT)[number];
export type ShareMethod = (typeof SHARE_METHODS)[number];
export type LinkName = (typeof LINK_NAMES)[number];

export type UsageEvent =
  | { name: 'share'; content: ShareContent; method: ShareMethod }
  | { name: 'tutorial_complete' }
  | { name: 'alert_signup_sent' }
  | { name: 'link_open'; link: LinkName }
  | { name: 'opened_from_link' };

type AnalyticsModule = typeof import('@react-native-firebase/analytics');

const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

let firebase:
  { mod: AnalyticsModule; instance: ReturnType<AnalyticsModule['getAnalytics']> } | null | undefined;
let enabled = false;
let ready: Promise<void> | null = null;

function analytics() {
  if (firebase !== undefined) return firebase;
  firebase = null;
  if (!SUPPORTED) return firebase;
  try {
    // Required lazily: the native module is absent in Expo Go and tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-firebase/analytics') as AnalyticsModule;
    firebase = { mod, instance: mod.getAnalytics() };
  } catch {
    firebase = null;
  }
  return firebase;
}

/** Reads the saved choice and starts collection unless it is off. Safe to call more than once. */
export function initUsageStats(): Promise<void> {
  ready ??= (async () => {
    let saved: string | null = null;
    try {
      saved = await AsyncStorage.getItem(USAGE_STATS_STORAGE_KEY);
    } catch {
      // Unreadable storage keeps the default.
    }
    await apply(saved !== 'off');
  })();
  return ready;
}

async function apply(on: boolean) {
  enabled = on;
  const fb = analytics();
  if (!fb) return;
  try {
    await fb.mod.setAnalyticsCollectionEnabled(fb.instance, on);
    if (!on) await fb.mod.resetAnalyticsData(fb.instance);
  } catch {
    // Statistics never get in the way of the app.
  }
}

export async function getUsageStatsEnabled(): Promise<boolean> {
  await initUsageStats();
  return enabled;
}

export async function setUsageStatsEnabled(on: boolean): Promise<void> {
  await initUsageStats();
  try {
    await AsyncStorage.setItem(USAGE_STATS_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // The choice still applies for this session.
  }
  await apply(on);
}

/** Maps an Expo Router pathname to a screen name, or null for anything not on the list. */
export function screenForPath(pathname: string): UsageScreen | null {
  const segment = pathname.replace(/^\/+/, '').split(/[/?#]/)[0] || 'home';
  return (USAGE_SCREENS as readonly string[]).includes(segment) ? (segment as UsageScreen) : null;
}

/** Builds the exact event name and parameters sent, or null if a value is off the lists. */
export function eventPayload(event: UsageEvent): { name: string; params: Record<string, string> } | null {
  switch (event.name) {
    case 'share':
      if (!SHARE_CONTENT.includes(event.content) || !SHARE_METHODS.includes(event.method)) return null;
      return { name: 'share', params: { content_type: event.content, method: event.method } };
    case 'link_open':
      if (!LINK_NAMES.includes(event.link)) return null;
      return { name: 'link_open', params: { link: event.link } };
    case 'tutorial_complete':
    case 'alert_signup_sent':
    case 'opened_from_link':
      return { name: event.name, params: {} };
    default:
      return null;
  }
}

export function trackScreen(pathname: string): void {
  const screen = screenForPath(pathname);
  if (!screen) return;
  void initUsageStats().then(async () => {
    const fb = analytics();
    if (!enabled || !fb) return;
    try {
      await fb.mod.logScreenView(fb.instance, { screen_class: screen, screen_name: screen });
    } catch {
      // Ignored: see apply().
    }
  });
}

export function trackEvent(event: UsageEvent): void {
  const payload = eventPayload(event);
  if (!payload) return;
  void initUsageStats().then(async () => {
    const fb = analytics();
    if (!enabled || !fb) return;
    try {
      await fb.mod.logEvent(fb.instance, payload.name, payload.params);
    } catch {
      // Ignored: see apply().
    }
  });
}

/** Test hook: forget cached state between tests. */
export function resetUsageStatsForTests(): void {
  firebase = undefined;
  enabled = false;
  ready = null;
}
