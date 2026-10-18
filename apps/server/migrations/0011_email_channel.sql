-- Email as a channel: customers write to your support address, teammates answer from the inbox,
-- replies go out as email and the customer's answers come back into the same conversation.

-- The email subject (NULL for chat conversations).
ALTER TABLE conversations ADD COLUMN subject TEXT;

-- Email metadata on messages that travelled by email (all NULL for chat messages).
-- 'inbound': a customer's email; 'outbound': a team reply sent as an email.
ALTER TABLE messages ADD COLUMN email_direction TEXT CHECK (email_direction IN ('inbound', 'outbound'));
-- Message-ID header, without angle brackets: the customer's for inbound, ours for outbound.
ALTER TABLE messages ADD COLUMN email_message_id TEXT;
-- In-Reply-To of an inbound email, without angle brackets.
ALTER TABLE messages ADD COLUMN email_in_reply_to TEXT;
-- Outbound delivery: 'pending' until the provider accepts it, 'failed' after the last retry.
ALTER TABLE messages ADD COLUMN email_status TEXT CHECK (email_status IN ('pending', 'sent', 'failed'));
ALTER TABLE messages ADD COLUMN email_error TEXT;
ALTER TABLE messages ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN email_next_attempt_at INTEGER;
-- Inbound: 1 when DMARC (or DKIM aligned with the From domain) passed, 0 when the sender is unverified.
ALTER TABLE messages ADD COLUMN email_verified INTEGER;

CREATE INDEX messages_email_message_id ON messages(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX messages_email_due ON messages(email_next_attempt_at) WHERE email_status = 'pending';
-- "Last email sent" in Settings.
CREATE INDEX messages_email_outbound ON messages(created_at) WHERE email_direction = 'outbound';

-- The whole inbound email as text ("Show full email"): the message body only keeps the new part
-- (quoted history and signature stripped). Never HTML: an HTML-only email is converted to text.
CREATE TABLE email_originals (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,
  subject TEXT,
  -- Date header as sent (ISO 8601 when it parses).
  sent_at TEXT,
  text TEXT NOT NULL,
  -- JSON: { spf, dkim, dmarc } results from the receiving server's Authentication-Results.
  authentication TEXT,
  -- JSON array of attachment file names that were not imported (type, size or count).
  skipped_attachments TEXT,
  -- 'en' or 'fr': the language replies to this customer are written in (footer line).
  locale TEXT,
  created_at INTEGER NOT NULL
);
-- Per-sender rate limit and "last email received".
CREATE INDEX email_originals_sender ON email_originals(from_address, created_at);
CREATE INDEX email_originals_created ON email_originals(created_at);
