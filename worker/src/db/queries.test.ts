import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activateEmail,
  claimDelivery,
  deletePushSubscription,
  emailRecipientsFor,
  findEmailByAddress,
  getFollows,
  insertEvent,
  normaliseEmail,
  prunePendingSubscribers,
  pushRecipientsFor,
  setFollows,
  unsubscribeEmail,
  upsertPendingEmail,
  upsertPushSubscription,
  withinRateLimit,
} from './queries';

const db = () => env.DB;

async function subscribe(
  email: string,
  scope: 'all' | 'followed',
  models: string[],
  cadence: 'instant' | 'weekly' = 'instant',
) {
  const subscriber = await upsertPendingEmail(db(), { email, cadence, scope, consentIpHash: 'hash' });
  await setFollows(db(), 'email', subscriber.id, models);
  await activateEmail(db(), subscriber.id);
  return subscriber;
}

beforeEach(async () => {
  await db().exec('DELETE FROM email_subscribers');
  await db().exec('DELETE FROM push_subscriptions');
  await db().exec('DELETE FROM follows');
  await db().exec('DELETE FROM events');
  await db().exec('DELETE FROM deliveries');
  await db().exec('DELETE FROM rate_limits');
});

describe('email subscribers', () => {
  it('treats addresses case-insensitively without inventing aliases', async () => {
    await upsertPendingEmail(db(), {
      email: 'Reader@Example.COM',
      cadence: 'weekly',
      scope: 'all',
      consentIpHash: null,
    });
    expect(await findEmailByAddress(db(), 'reader@example.com')).not.toBeNull();

    // `+tag` and dots are genuinely different addresses at many providers, so
    // they must not be folded together.
    expect(normaliseEmail('Reader+alerts@Example.com')).toBe('reader+alerts@example.com');
    expect(normaliseEmail(' A.B@example.com ')).toBe('a.b@example.com');
  });

  it('re-subscribing does not create a second row and returns to pending', async () => {
    const first = await subscribe('reader@example.com', 'all', []);
    await unsubscribeEmail(db(), first.id);

    const second = await upsertPendingEmail(db(), {
      email: 'reader@example.com',
      cadence: 'weekly',
      scope: 'all',
      consentIpHash: null,
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('pending');
    const { results } = await db().prepare('SELECT id FROM email_subscribers').all();
    expect(results).toHaveLength(1);
  });

  it('unsubscribing forgets the followed models too', async () => {
    const subscriber = await subscribe('reader@example.com', 'followed', ['gpt-5.6-sol', 'claude-sonnet-5']);
    expect(await getFollows(db(), 'email', subscriber.id)).toHaveLength(2);

    await unsubscribeEmail(db(), subscriber.id);
    expect(await getFollows(db(), 'email', subscriber.id)).toEqual([]);
  });

  it('deletes unconfirmed signups after a week', async () => {
    const stale = await upsertPendingEmail(db(), {
      email: 'never-confirmed@example.com',
      cadence: 'weekly',
      scope: 'all',
      consentIpHash: null,
    });
    await db()
      .prepare('UPDATE email_subscribers SET created_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), stale.id)
      .run();

    await subscribe('confirmed@example.com', 'all', []);

    expect(await prunePendingSubscribers(db())).toBe(1);
    expect(await findEmailByAddress(db(), 'never-confirmed@example.com')).toBeNull();
    expect(await findEmailByAddress(db(), 'confirmed@example.com')).not.toBeNull();
  });
});

describe('fan-out targeting', () => {
  it('reaches "all" subscribers and followers, and nobody else', async () => {
    const everything = await subscribe('all@example.com', 'all', []);
    const follower = await subscribe('follows-sol@example.com', 'followed', ['gpt-5.6-sol']);
    await subscribe('follows-other@example.com', 'followed', ['claude-opus-5']);

    const recipients = await emailRecipientsFor(db(), ['gpt-5.6-sol'], 'instant');
    expect(recipients.map((row) => row.id).sort()).toEqual([everything.id, follower.id].sort());
  });

  /**
   * The bug this guards against is a mail per changed model. A subscriber
   * following three models that all move in one sync must appear exactly once.
   */
  it('returns a subscriber once even when several followed models change', async () => {
    const subscriber = await subscribe('reader@example.com', 'followed', ['a', 'b', 'c']);
    const recipients = await emailRecipientsFor(db(), ['a', 'b', 'c'], 'instant');
    expect(recipients.filter((row) => row.id === subscriber.id)).toHaveLength(1);
  });

  it('does not reach pending, unsubscribed, or differently-paced subscribers', async () => {
    await upsertPendingEmail(db(), {
      email: 'pending@example.com',
      cadence: 'instant',
      scope: 'all',
      consentIpHash: null,
    });
    const gone = await subscribe('gone@example.com', 'all', []);
    await unsubscribeEmail(db(), gone.id);
    await subscribe('weekly@example.com', 'all', [], 'weekly');

    expect(await emailRecipientsFor(db(), ['anything'], 'instant')).toHaveLength(0);
    expect(await emailRecipientsFor(db(), ['anything'], 'weekly')).toHaveLength(1);
  });

  it('targets push subscriptions the same way', async () => {
    const wide = await upsertPushSubscription(db(), {
      endpoint: 'https://fcm.googleapis.com/fcm/send/aaa',
      p256dh: 'p',
      auth: 'a',
      scope: 'all',
    });
    const narrow = await upsertPushSubscription(db(), {
      endpoint: 'https://fcm.googleapis.com/fcm/send/bbb',
      p256dh: 'p',
      auth: 'a',
      scope: 'followed',
    });
    await setFollows(db(), 'push', narrow.id, ['gpt-5.6-sol']);

    const hits = await pushRecipientsFor(db(), ['gpt-5.6-sol']);
    expect(hits.map((row) => row.id).sort()).toEqual([wide.id, narrow.id].sort());
    expect(await pushRecipientsFor(db(), ['unrelated'])).toHaveLength(1);
  });
});

describe('push subscriptions', () => {
  it('is idempotent on the endpoint and refreshes rotated keys', async () => {
    const first = await upsertPushSubscription(db(), {
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
      p256dh: 'old-key',
      auth: 'old-auth',
      scope: 'all',
    });
    await db().prepare('UPDATE push_subscriptions SET failure_count = 3 WHERE id = ?').bind(first.id).run();

    const second = await upsertPushSubscription(db(), {
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
      p256dh: 'new-key',
      auth: 'new-auth',
      scope: 'followed',
    });

    expect(second.id).toBe(first.id);
    expect(second.p256dh).toBe('new-key');
    expect(second.scope).toBe('followed');
    // A fresh opt-in clears the failure history, so a subscription that went
    // quiet and came back is not immediately excluded by the fan-out filter.
    expect(second.failure_count).toBe(0);
  });

  it('deleting a subscription takes its follows with it', async () => {
    const subscription = await upsertPushSubscription(db(), {
      endpoint: 'https://web.push.apple.com/abc',
      p256dh: 'p',
      auth: 'a',
      scope: 'followed',
    });
    await setFollows(db(), 'push', subscription.id, ['gpt-5.6-sol']);

    await deletePushSubscription(db(), 'https://web.push.apple.com/abc');
    expect(await getFollows(db(), 'push', subscription.id)).toEqual([]);
  });
});

describe('idempotency', () => {
  it('lets exactly one caller claim a delivery', async () => {
    const first = await claimDelivery(db(), 'event-1', 'email', 'sub-1', 'instant');
    const second = await claimDelivery(db(), 'event-1', 'email', 'sub-1', 'instant');
    expect([first, second]).toEqual([true, false]);
  });

  it('keeps channels and subscribers independent', async () => {
    expect(await claimDelivery(db(), 'event-1', 'email', 'sub-1', 'instant')).toBe(true);
    expect(await claimDelivery(db(), 'event-1', 'email', 'sub-1', 'weekly')).toBe(true);
    expect(await claimDelivery(db(), 'event-1', 'email', 'sub-2', 'instant')).toBe(true);
    expect(await claimDelivery(db(), 'event-2', 'email', 'sub-1', 'instant')).toBe(true);
  });

  it('records an event once, so a retried notify is a no-op', async () => {
    expect(await insertEvent(db(), 'evt-abc', '{"changes":[]}', ['m1'])).toBe(true);
    expect(await insertEvent(db(), 'evt-abc', '{"changes":[]}', ['m1'])).toBe(false);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit and refuses beyond it', async () => {
    const results: boolean[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      results.push(await withinRateLimit(db(), 'test:bucket', 3, 3600));
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts each bucket separately', async () => {
    expect(await withinRateLimit(db(), 'a', 1, 3600)).toBe(true);
    expect(await withinRateLimit(db(), 'a', 1, 3600)).toBe(false);
    expect(await withinRateLimit(db(), 'b', 1, 3600)).toBe(true);
  });
});

describe('schema constraints', () => {
  it('refuses a status the application does not understand', async () => {
    await expect(
      db()
        .prepare(
          `INSERT INTO email_subscribers (id, email, status, cadence, scope, created_at)
           VALUES ('x', 'x@example.com', 'sort-of-active', 'weekly', 'all', '2026-01-01')`,
        )
        .run(),
    ).rejects.toThrow();
  });
});
