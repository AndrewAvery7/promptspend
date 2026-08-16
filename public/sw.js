/*
 * PromptSpend service worker.
 *
 * Its entire job is push. There is no offline caching here on purpose: the
 * pricing catalog is the point of the site, and a service worker that served a
 * stale copy of it would turn "prices re-checked every morning" into a lie that
 * is very hard for a visitor to detect. The app is a static bundle behind a
 * CDN; it loads fast enough without a cache layer that can go wrong.
 *
 * This file is served as-is from /public, so it is plain JavaScript with no
 * build step and no imports.
 */

const FALLBACK = {
  title: 'LLM pricing changed',
  body: 'Open PromptSpend to see what moved.',
};

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close. There is
  // no cached state to migrate, so the usual reason for waiting does not apply.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = FALLBACK;
  try {
    if (event.data) payload = { ...FALLBACK, ...event.data.json() };
  } catch {
    // A push we cannot parse is still a push worth showing — the browser
    // requires *some* notification to be displayed, and silently swallowing it
    // is what gets a site's push permission revoked by the user agent.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // The icon lives next to the service worker, so this resolves correctly
      // whether the site is at a sub-path or a custom domain root.
      icon: new URL('icon-192.png', self.registration.scope).href,
      badge: new URL('badge-72.png', self.registration.scope).href,
      // Same tag replaces an unread notification for the same event instead of
      // stacking a second copy on the lock screen.
      tag: payload.tag || 'promptspend',
      renotify: false,
      requireInteraction: false,
      data: { url: payload.url || self.registration.scope },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;

  // Focus an existing tab if one is already on the site; opening a fourth copy
  // of a page the user already has is a small rudeness that adds up.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/*
 * The push service can invalidate a subscription at any time and tells the page
 * through this event. Without handling it the subscription silently dies and
 * the user believes they are still subscribed — the single most common way push
 * "stops working for no reason".
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey =
        (event.oldSubscription && event.oldSubscription.options.applicationServerKey) || null;
      if (!applicationServerKey) return;

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // The endpoint changed, so tell the API about the new one. The API
      // origin arrives on this worker's own registration URL — a service worker
      // has no access to the page's build-time config, and a generated config
      // file would be one more artifact that can go stale.
      const api = new URL(self.location.href).searchParams.get('api');
      if (!api) return;
      let apiOrigin;
      try {
        apiOrigin = new URL(api).origin;
      } catch {
        return;
      }
      const allowedOrigins = new Set([
        'https://api.promptspend.dev',
        'http://localhost:8787',
        'http://127.0.0.1:8787',
      ]);
      if (!allowedOrigins.has(apiOrigin)) return;
      await fetch(`${apiOrigin}/v1/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
          scope: 'all',
        }),
      });
    })(),
  );
});
