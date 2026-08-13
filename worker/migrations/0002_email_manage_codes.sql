-- Short-lived, single-use verification codes let native iOS and Android users
-- manage email-alert preferences without a password, account, or bearer token
-- in a custom URL scheme. Raw codes are never stored.

CREATE TABLE email_manage_codes (
  id              TEXT PRIMARY KEY,
  subscriber_id   TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_email_manage_codes_subscriber
  ON email_manage_codes (subscriber_id, created_at DESC);

CREATE INDEX idx_email_manage_codes_expiry
  ON email_manage_codes (expires_at);
