-- API keys (each acts as a bot teammate) and webhook endpoints with a delivery log.

-- Bots are teammates that only act through an API key: they never sign in, are never assigned
-- automatically and are hidden from the team list.
ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'bot'));

-- Only the SHA-256 of a key is stored; the key itself is shown once, when it is created.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- First characters of the key, to recognise it in the list ("ydk_3f9k2m…").
  token_prefix TEXT NOT NULL,
  -- JSON array of scopes.
  scopes TEXT NOT NULL,
  bot_agent_id TEXT NOT NULL REFERENCES agents(id),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT
);
CREATE INDEX api_keys_created ON api_keys(created_at DESC);

CREATE TABLE webhook_endpoints (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  description TEXT,
  -- JSON array of event names; ["*"] receives every event.
  events TEXT NOT NULL,
  -- Signing secret, AES-GCM encrypted with a key derived from SESSION_SECRET.
  secret_ciphertext TEXT NOT NULL,
  -- After a roll the old secret also signs deliveries until it expires, so receivers can switch over.
  previous_secret_ciphertext TEXT,
  previous_secret_expires_at INTEGER,
  -- Set when an API key created the endpoint; revoking the key disables it.
  api_key_id TEXT REFERENCES api_keys(id),
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  disabled_reason TEXT,
  -- First failed attempt since the last success; endpoints failing for 3 days are disabled.
  failing_since INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX webhook_endpoints_key ON webhook_endpoints(api_key_id);

-- One row per event per endpoint. Retried with backoff for about 3 days; kept 30 days.
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  -- Same for every endpoint that receives the event; receivers use it to drop duplicates.
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  -- Contact the event is about, so erasing a contact also erases their pending deliveries.
  contact_id TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_status_code INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE INDEX webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX webhook_deliveries_contact ON webhook_deliveries(contact_id);
CREATE INDEX webhook_deliveries_created ON webhook_deliveries(created_at);
