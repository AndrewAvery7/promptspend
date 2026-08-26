import type { Href } from 'expo-router';

// Expo regenerates the concrete typed-route union during bundling. These
// constants keep source checks stable before that generated file is refreshed.
export const APP_ROUTES = {
  compare: '/compare' as Href,
  data: '/data' as Href,
  estimate: '/estimate' as Href,
  home: '/home' as Href,
  learn: '/learn' as Href,
} as const;

export function helpHref(entryId: string): Href {
  return `${String(APP_ROUTES.learn)}?help=${encodeURIComponent(entryId)}` as Href;
}
