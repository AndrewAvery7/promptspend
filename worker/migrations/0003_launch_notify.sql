-- The mobile-launch notification list.
--
-- A deliberately separate table rather than a column on `email_subscribers`,
-- for three reasons that all bite later if the two are merged:
--
--   1. Different consent. Someone who asked to hear about a price move has not
--      asked to hear about an app release, and the reverse. Sharing a row would
--      make one opt-in silently authorise the other.
--   2. Different lifecycle. `email_subscribers` is open-ended; this list exists
--      to send exactly one message and is then deleted wholesale. Keeping it
--      apart makes that deletion a DROP rather than a filtered DELETE run
--      against rows people still depend on.
--   3. The subscribe path differs. `POST /v1/email/subscribe` treats an address
--      that is already active as a management request and mails a code instead
--      of subscribing — correct there, and it would silently swallow a launch
--      signup from anyone who already gets price alerts.
--
-- Same minimum-data rule as the initial schema: an address, its state, and a
-- salted hash of the connection that consented. No names, no raw IPs, no opens.

CREATE TABLE launch_subscribers (
  id                TEXT PRIMARY KEY,
  -- Lowercased before insert so UNIQUE actually prevents a duplicate under
  -- different capitalisation, matching `email_subscribers`.
  email             TEXT NOT NULL UNIQUE,
  -- pending → active on confirmation → notified once the launch mail is sent.
  -- Nothing is ever sent to `pending` beyond the single confirmation mail.
  status            TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed', 'notified')),
  created_at        TEXT NOT NULL,
  confirmed_at      TEXT,
  unsubscribed_at   TEXT,
  notified_at       TEXT,
  -- Consent evidence, same shape and same reasoning as email_subscribers.
  consent_ip_hash   TEXT,
  consent_at        TEXT
);

-- The only read that matters at send time is "who is active", and the only
-- housekeeping read is "which pending rows have gone stale".
CREATE INDEX idx_launch_status ON launch_subscribers (status, created_at);
