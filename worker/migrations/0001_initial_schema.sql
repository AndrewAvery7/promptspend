-- TokenTally alerts: initial schema.
--
-- Two subscriber kinds share one follow table rather than each carrying its own
-- model list, because the fan-out query — "who wants to hear about this model?"
-- — is the hot path and wants a single index to answer it.
--
-- The site's promise is "no accounts, no tracking". Storing an email address is
-- the first thing here that touches that promise, so the schema holds the
-- minimum that makes the feature work and the compliance record defensible:
-- an address, what they asked for, and hashed proof of when they asked. No
-- names, no raw IPs, no opens, no click tracking.

CREATE TABLE email_subscribers (
  id                TEXT PRIMARY KEY,
  -- Normalised to lowercase before insert so the UNIQUE constraint actually
  -- prevents a second subscription under different capitalisation.
  email             TEXT NOT NULL UNIQUE,
  -- pending → active on confirmation. Nothing is ever sent to `pending`
  -- beyond the single confirmation mail.
  status            TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed', 'bounced')),
  cadence           TEXT NOT NULL CHECK (cadence IN ('instant', 'weekly')),
  -- 'all' tracks every model; 'followed' uses the rows in `follows`.
  scope             TEXT NOT NULL CHECK (scope IN ('all', 'followed')),
  created_at        TEXT NOT NULL,
  confirmed_at      TEXT,
  unsubscribed_at   TEXT,
  last_sent_at      TEXT,
  -- Hard bounces still count against the sending quota, so a repeatedly
  -- failing address is retired rather than retried forever.
  bounce_count      INTEGER NOT NULL DEFAULT 0,
  -- Consent evidence. The IP is stored only as a salted hash: enough to show a
  -- signup was not fabricated, not enough to locate anyone.
  consent_ip_hash   TEXT,
  consent_at        TEXT
);

CREATE INDEX idx_email_status_cadence ON email_subscribers (status, cadence);

CREATE TABLE push_subscriptions (
  id                TEXT PRIMARY KEY,
  -- The push service URL doubles as the subscription's natural key: browsers
  -- mint a new one whenever the old is invalidated, so UNIQUE here makes
  -- re-subscribing idempotent.
  endpoint          TEXT NOT NULL UNIQUE,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  scope             TEXT NOT NULL CHECK (scope IN ('all', 'followed')),
  created_at        TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  last_success_at   TEXT,
  failure_count     INTEGER NOT NULL DEFAULT 0
);

-- One row per (subscriber, model). `subscriber_kind` keeps push and email
-- subscribers in the same table without their ids being able to collide.
CREATE TABLE follows (
  subscriber_kind   TEXT NOT NULL CHECK (subscriber_kind IN ('email', 'push')),
  subscriber_id     TEXT NOT NULL,
  model_id          TEXT NOT NULL,
  PRIMARY KEY (subscriber_kind, subscriber_id, model_id)
);

CREATE INDEX idx_follows_model ON follows (model_id, subscriber_kind);

-- Every change set the pipeline reports. Kept after delivery because the weekly
-- digest is assembled from the events of the preceding week, not from a live
-- diff, and because it is the audit trail for "why did I get this mail?".
CREATE TABLE events (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  -- Denormalised JSON of the change set, exactly as the pipeline sent it.
  payload           TEXT NOT NULL,
  model_ids         TEXT NOT NULL,
  instant_sent_at   TEXT,
  digested_at       TEXT
);

CREATE INDEX idx_events_created ON events (created_at);

-- Idempotency. The pipeline may retry a notify call, and a retry must not mean
-- a second notification: the primary key is deterministic in
-- (event, subscriber), so a repeat insert is rejected rather than delivered.
CREATE TABLE deliveries (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL,
  subscriber_kind   TEXT NOT NULL,
  subscriber_id     TEXT NOT NULL,
  channel           TEXT NOT NULL,
  sent_at           TEXT NOT NULL,
  outcome           TEXT NOT NULL
);

CREATE INDEX idx_deliveries_event ON deliveries (event_id);

-- Fixed-window rate limiting. D1 rather than KV because KV's eventual
-- consistency makes a counter that a determined caller can simply outrun.
CREATE TABLE rate_limits (
  bucket            TEXT PRIMARY KEY,
  count             INTEGER NOT NULL,
  window_start      INTEGER NOT NULL
);
