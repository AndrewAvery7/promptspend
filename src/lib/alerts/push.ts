/**
 * Browser-side push plumbing.
 *
 * The awkward parts of the Push API, in one place: capability detection that
 * distinguishes "this browser cannot" from "this browser will not", a
 * permission prompt that can only ever be asked once, and the base64url →
 * Uint8Array conversion the spec requires for the application server key.
 */

import { ALERTS_API } from '@/config';

export type PushSupport =
  | { supported: true }
  /** iOS only exposes push to sites installed to the home screen. */
  | { supported: false; reason: 'ios-needs-install' }
  | { supported: false; reason: 'unsupported' }
  /** A page served over plain HTTP has no service worker at all. */
  | { supported: false; reason: 'insecure-context' };

export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'unsupported' };
  if (!window.isSecureContext) return { supported: false, reason: 'insecure-context' };

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // Safari on iOS hides both until the site is added to the home screen, and
    // telling someone "your browser does not support this" when the real answer
    // is "add it to your home screen" is a needlessly dead end.
    const isIos =
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return { supported: false, reason: isIos ? 'ios-needs-install' : 'unsupported' };
  }
  return { supported: true };
}

export function permissionState(): NotificationPermission | 'unavailable' {
  if (typeof Notification === 'undefined') return 'unavailable';
  return Notification.permission;
}

/**
 * The application server key must be raw bytes, not the string the API hands us.
 *
 * Backed by an explicit ArrayBuffer rather than the shorthand constructor:
 * `PushSubscriptionOptions` wants a `BufferSource`, and a plain `new
 * Uint8Array(n)` is typed over `ArrayBufferLike`, which admits SharedArrayBuffer
 * and so does not satisfy it.
 */
function decodeVapidKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Register the service worker, passing the API origin on the query string.
 *
 * A service worker cannot read the page's build-time configuration, and it
 * needs the API origin to re-register a subscription the push service has
 * rotated. The URL is the one channel available at registration time that
 * survives into the worker's own `self.location`.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const url = `${import.meta.env.BASE_URL}sw.js?api=${encodeURIComponent(ALERTS_API)}`;
  return navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (detectPushSupport().supported !== true) return null;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export interface SubscribeResult {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class PushDenied extends Error {}

/**
 * Ask for permission and create a subscription.
 *
 * `userVisibleOnly` is required by every implementation and is also the honest
 * promise: this site will never use a push to do something invisible.
 */
export async function subscribe(vapidPublicKey: string): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    // A denial is permanent from JavaScript's point of view — the prompt cannot
    // be raised again, only reversed by the user in site settings.
    throw new PushDenied(
      permission === 'denied'
        ? 'Notifications are blocked for this site. You can re-enable them in your browser’s site settings.'
        : 'Notification permission was dismissed.',
    );
  }

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(vapidPublicKey),
  });

  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser produced a subscription without encryption keys.');
  }
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Tear down locally. The caller tells the API separately. */
export async function unsubscribeLocally(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

export function subscriptionToPayload(subscription: PushSubscription): SubscribeResult | null {
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
