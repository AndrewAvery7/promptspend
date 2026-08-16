import { defineConfig } from '@playwright/test';

/**
 * Browser tests, run against the **built** site.
 *
 * Not the dev server: the 159 generated pages only exist after `build:pages`,
 * and they are now a large share of what a visitor actually lands on. Testing
 * the dev server would leave the majority of the site unexercised.
 *
 * These exist because the unit suite cannot see layout. It can prove the cost
 * engine is right and the copy is present; it cannot tell you the rate table
 * pushes the page sideways on a phone, or that a button is 32px tall under a
 * thumb. Both have happened here, and both were found by a person squinting at
 * a screen rather than by anything automated.
 */

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

/** A touch device, defined by hand so the intent is visible in the config. */
function phone(width: number, height: number) {
  return {
    viewport: { width, height },
    // `hasTouch` is what makes `@media (pointer: coarse)` match, which is where
    // the 44px touch-target rules live. Without it those rules never apply and
    // the test would be checking the desktop stylesheet on a narrow screen.
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  };
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A `.only` left in a commit would silently green the rest of the suite.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    // The site ships no analytics and the tests should not invent any traffic
    // to third parties either; anything unexpected is a finding, not noise.
    bypassCSP: false,
  },

  projects: [
    // 320 is the narrowest width anyone still designs for, and the width at
    // which horizontal overflow first appears.
    { name: 'phone-320', use: phone(320, 640) },
    { name: 'phone-390', use: phone(390, 844) },
    { name: 'tablet-768', use: phone(768, 1024) },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],

  webServer: {
    // Builds as well as serves, so a run can never be testing a stale `dist/`
    // or one built for a different base path.
    //
    // Two details that each cost a full timeout to find:
    //
    // `--host 127.0.0.1` — `vite preview` binds to `localhost`, which on Windows
    // resolves to ::1 first, so a readiness check against 127.0.0.1 never
    // succeeds and the run dies with no failing test to point at.
    //
    // `BASE_PATH` — `vite preview` recomputes `base` from the environment. Built
    // with it and served without it, the app is at `/promptspend/` while every
    // test asks for `/`, and all 55 fail identically for one reason.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    env: {
      BASE_PATH: '/',
      SITE_URL: BASE,
      VITE_ALERTS_API: process.env.VITE_ALERTS_API ?? '',
      VITE_TURNSTILE_SITE_KEY: process.env.VITE_TURNSTILE_SITE_KEY ?? '',
    },
    url: `${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
  },
});
