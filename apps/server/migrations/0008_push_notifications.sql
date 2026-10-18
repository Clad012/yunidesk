-- Push notifications for teammates (Web Push) on their phones and computers.

-- What each teammate wants pushed, as JSON ({ newConversation, assignedMessage, assigned, handoff });
-- missing keys mean "on".
ALTER TABLE agents ADD COLUMN push_preferences TEXT NOT NULL DEFAULT '{}';

-- One row per browser/device that turned push on. The endpoint is the push service URL the browser
-- gave us; p256dh and auth are its public encryption key and secret (RFC 8291).
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_success_at INTEGER,
  -- Consecutive failed sends; the subscription is dropped after a few.
  failure_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_agent ON push_subscriptions(agent_id);
