/**
 * Every statement that touches D1.
 *
 * Keeping SQL in one module means the fan-out query — the only one whose shape
 * really matters for cost and latency — can be read next to the index that
 * serves it, instead of being assembled from fragments across the route
 * handlers.
 */

import { bytesToB64url, randomBytes } from '../lib/bytes';

export type SubscriberKind = 'email' | 'push';
export type Cadence = 'instant' | 'weekly';
export type Scope = 'all' | 'followed';
export type EmailStatus = 'pending' | 'active' | 'unsubscribed' | 'bounced';

export interface EmailSubscriber {
  id: string;
  email: string;
  status: EmailStatus;
  cadence: Cadence;
  scope: Scope;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  last_sent_at: string | null;
  bounce_count: number;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  scope: Scope;
  failure_count: number;
}

export function newId(): string {
  return bytesToB64url(randomBytes(16));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Addresses are lowercased and trimmed, and nothing else.
 *
 * Stripping Gmail's dots or `+tags` would be presumptuous: those are legitimate
 * distinct addresses at plenty of providers, and treating them as duplicates
 * would silently refuse someone a subscription they are entitled to.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------- email

export async function findEmailByAddress(db: D1Database, email: string): Promise<EmailSubscriber | null> {
  return db
    .prepare('SELECT * FROM email_subscribers WHERE email = ?')
    .bind(normaliseEmail(email))
    .first<EmailSubscriber>();
}

export async function findEmailById(db: D1Database, id: string): Promise<EmailSubscriber | null> {
  return db.prepare('SELECT * FROM email_subscribers WHERE id = ?').bind(id).first<EmailSubscriber>();
}

/**
 * Create a pending subscription, or revive an existing row.
 *
 * Re-subscribing after unsubscribing has to work, and re-submitting the form
 * while still pending has to not create a second row — so this is an upsert
 * keyed on the address that always lands in `pending` and always returns the
 * id the confirmation link will carry.
 */
export async function upsertPendingEmail(
  db: D1Database,
  input: { email: string; cadence: Cadence; scope: Scope; consentIpHash: string | null },
): Promise<EmailSubscriber> {
  const email = normaliseEmail(input.email);
  const existing = await findEmailByAddress(db, email);
  const timestamp = nowIso();

  if (existing) {
    await db
      .prepare(
        `UPDATE email_subscribers
            SET status = 'pending', cadence = ?, scope = ?, unsubscribed_at = NULL,
                consent_ip_hash = ?, consent_at = ?
          WHERE id = ?`,
      )
      .bind(input.cadence, input.scope, input.consentIpHash, timestamp, existing.id)
      .run();
    return (await findEmailById(db, existing.id))!;
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO email_subscribers
         (id, email, status, cadence, scope, created_at, consent_ip_hash, consent_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .bind(id, email, input.cadence, input.scope, timestamp, input.consentIpHash, timestamp)
    .run();
  return (await findEmailById(db, id))!;
}

export async function activateEmail(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE email_subscribers
          SET status = 'active', confirmed_at = COALESCE(confirmed_at, ?)
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(nowIso(), id)
    .run();
}

/**
 * Unsubscribe: delete the address, do not flag it.
 *
 * This used to set `status = 'unsubscribed'` and keep the row — while the
 * unsubscribe page, the in-app panel and SECURITY.md all told the reader their
 * address had been *deleted, not flagged*. The claim was false. On a site whose
 * entire pitch is that its numbers can be checked, a false privacy claim is the
 * worst kind of bug to ship.
 *
 * A suppression row is the conventional choice, and the right one when a list
 * can be added to in bulk: it stops a re-import silently re-subscribing someone
 * who opted out. There is no bulk path here — the only way onto this list is
 * double opt-in by the owner of the address — so a suppression row would retain
 * personal data against an explicit promise while protecting against nothing.
 *
 * Re-subscribing later therefore starts a genuinely fresh record, which is what
 * the same copy already promises.
 */
export async function unsubscribeEmail(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM follows WHERE subscriber_kind = 'email' AND subscriber_id = ?`).bind(id),
    db.prepare('DELETE FROM email_subscribers WHERE id = ?').bind(id),
  ]);
}

export async function updateEmailPreferences(
  db: D1Database,
  id: string,
  input: { cadence: Cadence; scope: Scope },
): Promise<void> {
  await db
    .prepare('UPDATE email_subscribers SET cadence = ?, scope = ? WHERE id = ?')
    .bind(input.cadence, input.scope, id)
    .run();
}

export async function markEmailSent(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .prepare(`UPDATE email_subscribers SET last_sent_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(nowIso(), ...ids)
    .run();
}

/** Three hard bounces retires an address: it is costing quota and reputation. */
export async function recordEmailBounce(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE email_subscribers
          SET bounce_count = bounce_count + 1,
              status = CASE WHEN bounce_count + 1 >= 3 THEN 'bounced' ELSE status END
        WHERE id = ?`,
    )
    .bind(id)
    .run();
}

// ---------------------------------------------------------------- push

export async function upsertPushSubscription(
  db: D1Database,
  input: { endpoint: string; p256dh: string; auth: string; scope: Scope },
): Promise<PushSubscriptionRow> {
  const timestamp = nowIso();
  // The browser reissues the same endpoint for the same subscription, so this
  // doubles as "I am still here" — the keys can rotate underneath a stable
  // endpoint and the failure count resets on a fresh opt-in.
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, scope, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE
         SET p256dh = excluded.p256dh, auth = excluded.auth, scope = excluded.scope,
             last_seen_at = excluded.last_seen_at, failure_count = 0`,
    )
    .bind(newId(), input.endpoint, input.p256dh, input.auth, input.scope, timestamp, timestamp)
    .run();

  return (await db
    .prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?')
    .bind(input.endpoint)
    .first<PushSubscriptionRow>())!;
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<void> {
  const row = await db
    .prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .first<{ id: string }>();
  if (!row) return;
  await db.batch([
    db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(row.id),
    db.prepare(`DELETE FROM follows WHERE subscriber_kind = 'push' AND subscriber_id = ?`).bind(row.id),
  ]);
}

export async function recordPushSuccess(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE push_subscriptions SET last_success_at = ?, failure_count = 0 WHERE id = ?')
    .bind(nowIso(), id)
    .run();
}

export async function recordPushFailure(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?')
    .bind(id)
    .run();
}

// ---------------------------------------------------------------- follows

export async function setFollows(
  db: D1Database,
  kind: SubscriberKind,
  subscriberId: string,
  modelIds: string[],
): Promise<void> {
  const unique = [...new Set(modelIds)].slice(0, MAX_FOLLOWS);
  const statements: D1PreparedStatement[] = [
    db
      .prepare('DELETE FROM follows WHERE subscriber_kind = ? AND subscriber_id = ?')
      .bind(kind, subscriberId),
  ];
  for (const modelId of unique) {
    statements.push(
      db
        .prepare('INSERT INTO follows (subscriber_kind, subscriber_id, model_id) VALUES (?, ?, ?)')
        .bind(kind, subscriberId, modelId),
    );
  }
  await db.batch(statements);
}

/** A ceiling on follows keeps one subscriber from turning the fan-out into a scan. */
export const MAX_FOLLOWS = 40;

export async function getFollows(
  db: D1Database,
  kind: SubscriberKind,
  subscriberId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT model_id FROM follows WHERE subscriber_kind = ? AND subscriber_id = ? ORDER BY model_id')
    .bind(kind, subscriberId)
    .all<{ model_id: string }>();
  return results.map((row) => row.model_id);
}

// ---------------------------------------------------------------- fan-out

function placeholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

/**
 * Who should hear about a change to these models?
 *
 * Everyone whose scope is 'all', plus everyone following at least one of the
 * changed models. `DISTINCT` matters: a subscriber following three models that
 * all moved in one run must still receive exactly one message.
 */
export async function emailRecipientsFor(
  db: D1Database,
  modelIds: string[],
  cadence: Cadence,
): Promise<EmailSubscriber[]> {
  if (modelIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT DISTINCT s.*
         FROM email_subscribers s
         LEFT JOIN follows f
           ON f.subscriber_kind = 'email' AND f.subscriber_id = s.id
        WHERE s.status = 'active'
          AND s.cadence = ?
          AND (s.scope = 'all' OR f.model_id IN (${placeholders(modelIds.length)}))`,
    )
    .bind(cadence, ...modelIds)
    .all<EmailSubscriber>();
  return results;
}

export async function allActiveEmailSubscribers(
  db: D1Database,
  cadence: Cadence,
): Promise<EmailSubscriber[]> {
  const { results } = await db
    .prepare(`SELECT * FROM email_subscribers WHERE status = 'active' AND cadence = ?`)
    .bind(cadence)
    .all<EmailSubscriber>();
  return results;
}

export async function pushRecipientsFor(db: D1Database, modelIds: string[]): Promise<PushSubscriptionRow[]> {
  if (modelIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT DISTINCT p.*
         FROM push_subscriptions p
         LEFT JOIN follows f
           ON f.subscriber_kind = 'push' AND f.subscriber_id = p.id
        WHERE p.failure_count < 5
          AND (p.scope = 'all' OR f.model_id IN (${placeholders(modelIds.length)}))`,
    )
    .bind(...modelIds)
    .all<PushSubscriptionRow>();
  return results;
}

// ---------------------------------------------------------------- events

export interface EventRow {
  id: string;
  created_at: string;
  payload: string;
  model_ids: string;
  instant_sent_at: string | null;
  digested_at: string | null;
}

/**
 * Record a change set. Returns false if this event id has been seen before,
 * which is how a retried notify call becomes a no-op instead of a second send.
 */
export async function insertEvent(
  db: D1Database,
  id: string,
  payload: string,
  modelIds: string[],
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO events (id, created_at, payload, model_ids) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, nowIso(), payload, JSON.stringify(modelIds))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markEventInstantSent(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE events SET instant_sent_at = ? WHERE id = ?').bind(nowIso(), id).run();
}

export async function undigestedEvents(db: D1Database): Promise<EventRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM events WHERE digested_at IS NULL ORDER BY created_at')
    .all<EventRow>();
  return results;
}

export async function markEventsDigested(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .prepare(`UPDATE events SET digested_at = ? WHERE id IN (${placeholders(ids.length)})`)
    .bind(nowIso(), ...ids)
    .run();
}

/**
 * Claim the right to deliver one event to one subscriber.
 *
 * True means "you are the first"; false means someone already sent this. The
 * uniqueness is enforced by the primary key rather than by a read-then-write,
 * so two concurrent fan-outs cannot both win.
 */
export async function claimDelivery(
  db: D1Database,
  eventId: string,
  kind: SubscriberKind,
  subscriberId: string,
  channel: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO deliveries (id, event_id, subscriber_kind, subscriber_id, channel, sent_at, outcome)
       VALUES (?, ?, ?, ?, ?, ?, 'claimed')
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(`${eventId}:${kind}:${subscriberId}:${channel}`, eventId, kind, subscriberId, channel, nowIso())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function recordDeliveryOutcome(
  db: D1Database,
  eventId: string,
  kind: SubscriberKind,
  subscriberId: string,
  channel: string,
  outcome: string,
): Promise<void> {
  await db
    .prepare('UPDATE deliveries SET outcome = ? WHERE id = ?')
    .bind(outcome, `${eventId}:${kind}:${subscriberId}:${channel}`)
    .run();
}

// ---------------------------------------------------------------- rate limit

/**
 * Fixed-window counter. Returns true when the caller is within budget.
 *
 * Fixed windows allow a burst of up to 2× the limit across a boundary, which is
 * fine here: this exists to stop a script enumerating the subscribe endpoint,
 * not to shape traffic precisely. Turnstile is the primary defence; this is the
 * backstop for when it is not configured.
 */
export async function withinRateLimit(
  db: D1Database,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE
         SET count = CASE WHEN rate_limits.window_start = excluded.window_start
                          THEN rate_limits.count + 1 ELSE 1 END,
             window_start = excluded.window_start`,
    )
    .bind(bucket, windowStart)
    .run();

  const row = await db
    .prepare('SELECT count FROM rate_limits WHERE bucket = ?')
    .bind(bucket)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

/** Housekeeping for the cron: rate-limit rows are worthless once their window passes. */
export async function pruneRateLimits(db: D1Database, olderThanSeconds = 3600): Promise<void> {
  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(Math.floor(Date.now() / 1000) - olderThanSeconds)
    .run();
}

/** Unconfirmed signups are deleted after a week rather than lingering as PII. */
export async function prunePendingSubscribers(db: D1Database): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare(`DELETE FROM email_subscribers WHERE status = 'pending' AND created_at < ?`)
    .bind(cutoff)
    .run();
  return result.meta.changes ?? 0;
}
