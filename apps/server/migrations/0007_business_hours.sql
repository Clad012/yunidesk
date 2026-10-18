-- Business hours: when the automatic away message was last sent in a conversation, so a customer
-- gets it once per closed period, never on every message.
ALTER TABLE conversations ADD COLUMN away_notified_at INTEGER;
