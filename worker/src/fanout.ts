/**
 * Turning one change set into many notifications.
 *
 * Three things govern this file.
 *
 * A retry must not double-send. The pipeline may call `/v1/notify` twice for
 * the same catalog state — a re-run job, a network timeout that actually
 * succeeded — so each (event, subscriber, channel) is claimed in D1 before
 * anything leaves, and the claim is a primary key, not a read-then-write.
 *
 * One subscriber gets one message. Somebody following four models that all
 * moved in the same run receives a single mail listing four changes, not four
 * mails. That is why recipients are resolved for the whole change set at once
 * rather than per change.
 *
 * A Worker invocation may make at most 1000 subrequests. Every push and every
 * email is one. The cap below keeps a fan-out inside that budget and reports
 * what it could not reach instead of failing silently at 1000 — see
 * `docs/ALERTS.md` for the queue-based upgrade path, which is worth building
 * at roughly the point this limit starts being hit.
 */

import { changedModelIds, summariseChangeSet, type ChangeSet } from './changes';
import {
  claimDelivery,
  deletePushSubscription,
  emailRecipientsFor,
  markEmailSent,
  markEventInstantSent,
  markEventsDigested,
  pushRecipientsFor,
  recordDeliveryOutcome,
  recordEmailBounce,
  recordPushFailure,
  recordPushSuccess,
  undigestedEvents,
  allActiveEmailSubscribers,
  getFollows,
  type EmailSubscriber,
} from './db/queries';
import { createTransport, type EmailTransport } from './email/transport';
import { renderDigest, renderInstantAlert, type Links } from './email/render';
import { buildNotificationPayload, sendPush } from './push/send';
import { issueToken } from './lib/tokens';
import { alertsApiUrl, siteUrl, requireSecret, type Env } from './env';

/** Comfortably inside the 1000-subrequest ceiling, leaving room for retries. */
const MAX_SENDS_PER_RUN = 700;

/** Push services dislike a thundering herd; this also bounds memory. */
const CONCURRENCY = 12;

export interface FanoutCounts {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  pruned: number;
  deferred: number;
}

const zero = (): FanoutCounts => ({
  attempted: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  pruned: 0,
  deferred: 0,
});

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function linksFor(env: Env, tokens: { unsubscribe: string; preferences: string }): Links {
  const site = siteUrl(env);
  return {
    unsubscribeUrl: `${alertsApiUrl(env, 'v1/email/unsubscribe')}?t=${encodeURIComponent(tokens.unsubscribe)}`,
    preferencesUrl: `${site}?alerts=${encodeURIComponent(tokens.preferences)}`,
    siteUrl: site,
  };
}

// ------------------------------------------------------------------ push

export async function fanoutPush(env: Env, event: { id: string; set: ChangeSet }): Promise<FanoutCounts> {
  const counts = zero();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return counts;

  const modelIds = changedModelIds(event.set);
  const recipients = await pushRecipientsFor(env.DB, modelIds);
  counts.attempted = recipients.length;

  const batch = recipients.slice(0, MAX_SENDS_PER_RUN);
  counts.deferred = recipients.length - batch.length;

  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };

  const payload = buildNotificationPayload({
    title: summariseChangeSet(event.set),
    body: event.set.changes
      .slice(0, 4)
      .map((change) => change.displayName)
      .join(', '),
    url: siteUrl(env),
    // Same tag replaces an unread notification rather than stacking a second
    // one on the lock screen for the same underlying event.
    tag: `promptspend-${event.id.slice(0, 24)}`,
  });

  await mapWithConcurrency(batch, CONCURRENCY, async (subscription) => {
    if (!(await claimDelivery(env.DB, event.id, 'push', subscription.id, 'push'))) {
      counts.skipped += 1;
      return;
    }

    const outcome = await sendPush(subscription, payload, vapid);
    switch (outcome.status) {
      case 'sent':
        counts.sent += 1;
        await recordPushSuccess(env.DB, subscription.id);
        await recordDeliveryOutcome(env.DB, event.id, 'push', subscription.id, 'push', 'sent');
        break;
      case 'gone':
        counts.pruned += 1;
        await deletePushSubscription(env.DB, subscription.endpoint);
        break;
      default:
        counts.failed += 1;
        await recordPushFailure(env.DB, subscription.id);
        await recordDeliveryOutcome(
          env.DB,
          event.id,
          'push',
          subscription.id,
          'push',
          `${outcome.status}:${outcome.code}`,
        );
    }
  });

  return counts;
}

// ----------------------------------------------------------------- email

async function sendToSubscriber(
  env: Env,
  transport: EmailTransport,
  subscriber: EmailSubscriber,
  build: (links: Links) => { subject: string; html: string; text: string },
): Promise<'sent' | 'failed'> {
  const secret = requireSecret(env, 'TOKEN_SECRET');
  const links = linksFor(env, {
    unsubscribe: await issueToken(secret, 'unsubscribe', subscriber.id),
    preferences: await issueToken(secret, 'preferences', subscriber.id),
  });

  const message = build(links);
  const result = await transport.send({
    to: subscriber.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: {
      // RFC 8058. Gmail and Yahoo require working one-click unsubscribe from
      // bulk senders, and without both headers together the button does not
      // appear at all.
      'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      // RFC 2919 wants a domain-scoped identifier, not a bare label — mail
      // clients group and filter on this, so it has to be globally unique.
      'List-Id': 'PromptSpend price alerts <alerts.promptspend.com>',
    },
  });

  if (result.ok) return 'sent';
  if (!result.retryable) await recordEmailBounce(env.DB, subscriber.id);
  console.warn(`email to subscriber ${subscriber.id} failed: ${result.detail}`);
  return 'failed';
}

export async function fanoutInstantEmail(
  env: Env,
  event: { id: string; set: ChangeSet },
): Promise<FanoutCounts> {
  const counts = zero();
  const transport = createTransport(env);

  const recipients = await emailRecipientsFor(env.DB, changedModelIds(event.set), 'instant');
  counts.attempted = recipients.length;

  const batch = recipients.slice(0, MAX_SENDS_PER_RUN);
  counts.deferred = recipients.length - batch.length;
  const delivered: string[] = [];

  await mapWithConcurrency(batch, CONCURRENCY, async (subscriber) => {
    if (!(await claimDelivery(env.DB, event.id, 'email', subscriber.id, 'instant'))) {
      counts.skipped += 1;
      return;
    }
    // Everyone on 'all' scope sees every change; everyone else sees only the
    // subset they follow, so the mail never lists a model they did not ask about.
    const visible = await narrowToFollowed(env, subscriber, event.set);
    if (visible.changes.length === 0) {
      counts.skipped += 1;
      await recordDeliveryOutcome(env.DB, event.id, 'email', subscriber.id, 'instant', 'not-followed');
      return;
    }

    const outcome = await sendToSubscriber(env, transport, subscriber, (links) =>
      renderInstantAlert(visible, links),
    );
    if (outcome === 'sent') {
      counts.sent += 1;
      delivered.push(subscriber.id);
    } else {
      counts.failed += 1;
    }
    await recordDeliveryOutcome(env.DB, event.id, 'email', subscriber.id, 'instant', outcome);
  });

  await markEmailSent(env.DB, delivered);
  await markEventInstantSent(env.DB, event.id);
  return counts;
}

async function narrowToFollowed(env: Env, subscriber: EmailSubscriber, set: ChangeSet): Promise<ChangeSet> {
  if (subscriber.scope === 'all') return set;
  const followed = new Set(await getFollows(env.DB, 'email', subscriber.id));
  return { ...set, changes: set.changes.filter((change) => followed.has(change.modelId)) };
}

/**
 * The weekly digest.
 *
 * Assembled from the events of the past week rather than from a fresh diff, so
 * a subscriber sees every move including ones that were later reversed —
 * "it went up and came back down" is information, and a week-on-week diff would
 * hide it.
 *
 * Subscribers with nothing to report still get a message. A digest that only
 * arrives when something happened is indistinguishable from a digest that has
 * quietly broken, and the whole point of this project is being able to tell
 * those two apart.
 */
export async function fanoutDigest(env: Env): Promise<FanoutCounts> {
  const counts = zero();
  const transport = createTransport(env);

  const events = await undigestedEvents(env.DB);
  const sets: ChangeSet[] = [];
  for (const row of events) {
    try {
      sets.push(JSON.parse(row.payload) as ChangeSet);
    } catch {
      console.warn(`event ${row.id} has an unparseable payload; skipping it`);
    }
  }

  const subscribers = await allActiveEmailSubscribers(env.DB, 'weekly');
  counts.attempted = subscribers.length;

  const batch = subscribers.slice(0, MAX_SENDS_PER_RUN);
  counts.deferred = subscribers.length - batch.length;
  const digestId = `digest-${new Date().toISOString().slice(0, 10)}`;
  const delivered: string[] = [];

  await mapWithConcurrency(batch, CONCURRENCY, async (subscriber) => {
    if (!(await claimDelivery(env.DB, digestId, 'email', subscriber.id, 'weekly'))) {
      counts.skipped += 1;
      return;
    }

    const visible: ChangeSet[] = [];
    for (const set of sets) {
      const narrowed = await narrowToFollowed(env, subscriber, set);
      if (narrowed.changes.length > 0) visible.push(narrowed);
    }

    const outcome = await sendToSubscriber(env, transport, subscriber, (links) =>
      renderDigest(visible, links),
    );
    if (outcome === 'sent') {
      counts.sent += 1;
      delivered.push(subscriber.id);
    } else {
      counts.failed += 1;
    }
    await recordDeliveryOutcome(env.DB, digestId, 'email', subscriber.id, 'weekly', outcome);
  });

  await markEmailSent(env.DB, delivered);
  // Only retire the events once the run that consumed them has finished, so a
  // crash mid-digest leaves them for next week rather than losing them.
  if (counts.deferred === 0)
    await markEventsDigested(
      env.DB,
      events.map((event) => event.id),
    );

  return counts;
}
