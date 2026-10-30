import AsyncStorage from '@react-native-async-storage/async-storage';
import * as firebase from '@react-native-firebase/analytics';
import { Platform } from 'react-native';

import {
  eventPayload,
  getUsageStatsEnabled,
  initUsageStats,
  resetUsageStatsForTests,
  screenForPath,
  setUsageStatsEnabled,
  trackEvent,
  trackScreen,
  USAGE_STATS_STORAGE_KEY,
  type UsageEvent,
} from '../usageStats';

const mocked = firebase as jest.Mocked<typeof firebase>;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  resetUsageStatsForTests();
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('screen names', () => {
  it('maps the app routes to fixed names', () => {
    expect(screenForPath('/')).toBe('home');
    expect(screenForPath('/estimate')).toBe('estimate');
    expect(screenForPath('/compare')).toBe('compare');
    expect(screenForPath('/data')).toBe('data');
    expect(screenForPath('/learn')).toBe('learn');
    expect(screenForPath('/receipt')).toBe('receipt');
  });

  it('never passes on a query, a hash, or an unknown path', () => {
    expect(screenForPath('/estimate?in=1200&model=gpt')).toBe('estimate');
    expect(screenForPath('/estimate#prompt')).toBe('estimate');
    expect(screenForPath('/my pasted prompt')).toBeNull();
    expect(screenForPath('/index')).toBeNull();
  });
});

describe('event payloads', () => {
  it('sends only fixed names and fixed values', () => {
    expect(eventPayload({ name: 'share', content: 'estimate', method: 'text' })).toEqual({
      name: 'share',
      params: { content_type: 'estimate', method: 'text' },
    });
    expect(eventPayload({ name: 'link_open', link: 'privacy' })).toEqual({
      name: 'link_open',
      params: { link: 'privacy' },
    });
    expect(eventPayload({ name: 'tutorial_complete' })).toEqual({ name: 'tutorial_complete', params: {} });
  });

  it('drops any value that is not on the lists', () => {
    const typed = {
      name: 'share',
      content: 'Summarize my contract',
      method: 'text',
    } as unknown as UsageEvent;
    const link = { name: 'link_open', link: 'https://example.com/?q=secret' } as unknown as UsageEvent;
    const unknown = { name: 'prompt_text', text: 'hello' } as unknown as UsageEvent;
    expect(eventPayload(typed)).toBeNull();
    expect(eventPayload(link)).toBeNull();
    expect(eventPayload(unknown)).toBeNull();
  });
});

describe('collection', () => {
  it('starts collection by default and sends screens and events', async () => {
    trackScreen('/compare');
    trackEvent({ name: 'alert_signup_sent' });
    await settle();
    expect(mocked.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), true);
    expect(mocked.logScreenView).toHaveBeenCalledWith(expect.anything(), {
      screen_class: 'compare',
      screen_name: 'compare',
    });
    expect(mocked.logEvent).toHaveBeenCalledWith(expect.anything(), 'alert_signup_sent', {});
  });

  it('sends nothing at all once switched off, and clears data on the device', async () => {
    await setUsageStatsEnabled(false);
    expect(await AsyncStorage.getItem(USAGE_STATS_STORAGE_KEY)).toBe('off');
    expect(mocked.setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(mocked.resetAnalyticsData).toHaveBeenCalled();
    trackScreen('/estimate');
    trackEvent({ name: 'tutorial_complete' });
    await settle();
    expect(mocked.logScreenView).not.toHaveBeenCalled();
    expect(mocked.logEvent).not.toHaveBeenCalled();
  });

  it('remembers the off choice on the next launch before anything is sent', async () => {
    await AsyncStorage.setItem(USAGE_STATS_STORAGE_KEY, 'off');
    trackScreen('/');
    await settle();
    expect(await getUsageStatsEnabled()).toBe(false);
    expect(mocked.setAnalyticsCollectionEnabled).not.toHaveBeenCalledWith(expect.anything(), true);
    expect(mocked.logScreenView).not.toHaveBeenCalled();
  });

  it('can be switched back on', async () => {
    await setUsageStatsEnabled(false);
    await setUsageStatsEnabled(true);
    expect(await getUsageStatsEnabled()).toBe(true);
    expect(await AsyncStorage.getItem(USAGE_STATS_STORAGE_KEY)).toBe('on');
  });

  it('does nothing outside iOS and Android', async () => {
    let isolated: jest.Mocked<typeof firebase> | undefined;
    /* eslint-disable @typescript-eslint/no-require-imports -- a fresh module registry needs require() */
    jest.isolateModules(() => {
      const { Platform: isolatedPlatform } = require('react-native') as { Platform: typeof Platform };
      Object.defineProperty(isolatedPlatform, 'OS', { configurable: true, value: 'web' });
      isolated = require('@react-native-firebase/analytics') as jest.Mocked<typeof firebase>;
      const web = require('../usageStats') as typeof import('../usageStats');
      web.trackScreen('/estimate');
      web.trackEvent({ name: 'tutorial_complete' });
    });
    /* eslint-enable @typescript-eslint/no-require-imports */
    await settle();
    expect(isolated?.getAnalytics).not.toHaveBeenCalled();
    expect(isolated?.logScreenView).not.toHaveBeenCalled();
    expect(isolated?.logEvent).not.toHaveBeenCalled();
  });

  it('is safe to start more than once', async () => {
    await Promise.all([initUsageStats(), initUsageStats()]);
    expect(mocked.setAnalyticsCollectionEnabled).toHaveBeenCalledTimes(1);
  });
});
