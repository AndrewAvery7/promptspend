/**
 * Input validation for anything that arrives from a browser.
 */

import { badRequest } from './http';
import { MAX_FOLLOWS, type Cadence, type Scope } from '../db/queries';

/**
 * Deliberately permissive, deliberately not a "full" RFC 5322 regex.
 *
 * The only address validation that means anything is sending a confirmation
 * mail and seeing whether someone clicks it, which is exactly what this system
 * does. A stricter pattern here would reject valid addresses — apostrophes,
 * new TLDs, long local parts — and buy nothing, because double opt-in already
 * catches every typo a regex could and many it could not.
 */
const EMAIL = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,190}\.[A-Za-z]{2,}$/;

export function requireEmail(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('An email address is required.');
  const email = value.trim();
  if (email.length > 254 || !EMAIL.test(email)) throw badRequest('That does not look like an email address.');
  return email;
}

export function requireCadence(value: unknown): Cadence {
  if (value === 'instant' || value === 'weekly') return value;
  throw badRequest('Cadence must be "instant" or "weekly".');
}

export function requireScope(value: unknown): Scope {
  if (value === 'all' || value === 'followed') return value;
  throw badRequest('Scope must be "all" or "followed".');
}

export function requireModelIds(value: unknown, scope: Scope): string[] {
  if (value === undefined || value === null) {
    if (scope === 'followed') throw badRequest('Choose at least one model to follow.');
    return [];
  }
  if (!Array.isArray(value)) throw badRequest('Models must be an array of model ids.');
  const ids = value.filter((id): id is string => typeof id === 'string' && /^[\w.:-]{1,128}$/.test(id));
  if (ids.length !== value.length) throw badRequest('One of the model ids is malformed.');
  if (scope === 'followed' && ids.length === 0) throw badRequest('Choose at least one model to follow.');
  if (ids.length > MAX_FOLLOWS) throw badRequest(`You can follow at most ${MAX_FOLLOWS} models.`);
  return [...new Set(ids)];
}

/**
 * Push endpoints, restricted to the services that actually issue them.
 *
 * Without this the endpoint field is a server-side request forgery primitive:
 * anyone could register `https://something.internal/` as their "subscription"
 * and have this worker POST attacker-chosen bytes to it on every price change,
 * from Cloudflare's network, with retries. The browser only ever produces
 * endpoints on these hosts, so refusing everything else costs nothing.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge, Android
  'android.googleapis.com', // legacy GCM
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com', // Windows / older Edge
  '.push.apple.com', // Safari, iOS
];

export function requirePushEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1024) {
    throw badRequest('A push endpoint is required.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest('That push endpoint is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw badRequest('Push endpoints must be https.');

  const host = url.hostname.toLowerCase();
  const known = PUSH_HOSTS.some((entry) => (entry.startsWith('.') ? host.endsWith(entry) : host === entry));
  if (!known) throw badRequest('That push endpoint is not from a recognised push service.');

  return url.toString();
}

/** Subscription keys are fixed-size base64url: 65 bytes and 16 bytes. */
export function requireSubscriptionKeys(value: unknown): { p256dh: string; auth: string } {
  if (typeof value !== 'object' || value === null) throw badRequest('Subscription keys are required.');
  const keys = value as { p256dh?: unknown; auth?: unknown };
  const b64 = /^[A-Za-z0-9_-]+$/;

  if (typeof keys.p256dh !== 'string' || !b64.test(keys.p256dh) || keys.p256dh.length !== 87) {
    throw badRequest('The subscription public key is malformed.');
  }
  if (typeof keys.auth !== 'string' || !b64.test(keys.auth) || keys.auth.length !== 22) {
    throw badRequest('The subscription auth secret is malformed.');
  }
  return { p256dh: keys.p256dh, auth: keys.auth };
}
