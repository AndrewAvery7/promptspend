import type { Href } from 'expo-router';

// Expo regenerates the concrete typed-route union during bundling. These
// constants keep source checks stable before that generated file is refreshed.
export const APP_ROUTES = {
  compare: '/compare' as Href,
  estimate: '/' as Href,
  home: '/home' as Href,
  learn: '/learn' as Href,
  more: '/more' as Href,
} as const;
