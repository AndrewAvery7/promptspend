/**
 * Delivering one push message, and knowing what the response means.
 *
 * The status codes matter more than the happy path here. A push subscription is
 * a wasting asset: browsers invalidate them when the user clears site data,
 * when the app is uninstalled, or on their own schedule. A service that keeps
 * retrying dead endpoints accumulates junk and slows every subsequent fan-out,
 * so 404 and 410 are treated as instructions to forget the subscription rather
 * than as errors to log and move past.
 */

import { encryptPayload, MAX_PAYLOAD_BYTES, type PushSubscriptionKeys } from './encrypt';
import { vapidAuthorization, type VapidKeys } from './vapid';

export type PushOutcome =
  | { status: 'sent' }
  /** The subscription is dead — delete it. */
  | { status: 'gone'; code: number }
  /** Transient: rate limited or the push service is unwell. Retry later. */
  | { status: 'retry'; code: number; detail: string }
  /** Our fault — bad keys, bad payload. Retrying will not help. */
  | { status: 'failed'; code: number; detail: string };

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** How long a push service should hold the message for an offline device. */
const TTL_SECONDS = 24 * 60 * 60;

export async function sendPush(target: PushTarget, payload: string, vapid: VapidKeys): Promise<PushOutcome> {
  let body: Uint8Array;
  try {
    body = await encryptPayload(payload, target as PushSubscriptionKeys);
  } catch (cause) {
    return {
      status: 'failed',
      code: 0,
      detail: cause instanceof Error ? cause.message : 'encryption failed',
    };
  }

  let authorization: string;
  try {
    authorization = await vapidAuthorization(target.endpoint, vapid);
  } catch (cause) {
    return {
      status: 'failed',
      code: 0,
      detail: cause instanceof Error ? cause.message : 'VAPID signing failed',
    };
  }

  let response: Response;
  try {
    response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
        // "normal" lets the device batch delivery with other wakeups. A price
        // change is worth telling someone about; it is not worth waking their
        // phone out of doze for.
        Urgency: 'normal',
      },
      body,
    });
  } catch (cause) {
    return {
      status: 'retry',
      code: 0,
      detail: cause instanceof Error ? cause.message : 'network error',
    };
  }

  if (response.status === 201 || response.status === 200 || response.status === 202) {
    return { status: 'sent' };
  }
  if (response.status === 404 || response.status === 410) {
    return { status: 'gone', code: response.status };
  }
  if (response.status === 429 || response.status >= 500) {
    return { status: 'retry', code: response.status, detail: await safeText(response) };
  }
  return { status: 'failed', code: response.status, detail: await safeText(response) };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}

export interface PushNotification {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * Build the JSON the service worker will render, trimming it to fit.
 *
 * One record is 4096 bytes and there is no continuation: an oversized payload
 * is rejected outright by the encrypter, so the body is cut here where the text
 * still means something rather than being truncated mid-field afterwards.
 */
export function buildNotificationPayload(notification: PushNotification): string {
  const serialise = (body: string) => JSON.stringify({ ...notification, body });

  let payload = serialise(notification.body);
  if (new TextEncoder().encode(payload).length <= MAX_PAYLOAD_BYTES) return payload;

  const overhead = new TextEncoder().encode(serialise('')).length;
  const room = MAX_PAYLOAD_BYTES - overhead - 1;
  let trimmed = notification.body;
  while (new TextEncoder().encode(trimmed).length > room && trimmed.length > 0) {
    trimmed = trimmed.slice(0, Math.max(0, Math.floor(trimmed.length * 0.9) - 1));
  }
  payload = serialise(`${trimmed.replace(/[\s,;]+$/, '')}…`);
  return payload;
}
