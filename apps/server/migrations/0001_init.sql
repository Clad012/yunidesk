-- Yunidesk: initial schema. Timestamps are Unix epoch milliseconds.

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'agent')),
  password_hash TEXT NOT NULL,
  disabled_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

-- Only the SHA-256 of a session token is stored.
CREATE TABLE agent_sessions (
  token_hash TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX agent_sessions_agent ON agent_sessions(agent_id);

CREATE TABLE agent_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'agent')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  -- The host app's user id, set only from a verified identity token.
  external_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  is_identified INTEGER NOT NULL DEFAULT 0,
  last_channel TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX contacts_email ON contacts(email);
CREATE INDEX contacts_last_seen ON contacts(last_seen_at);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('open', 'snoozed', 'resolved')),
  channel TEXT NOT NULL,
  assignee_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Preview of the last message the contact can see (never a note).
  last_message_at INTEGER NOT NULL,
  last_message_body TEXT,
  last_message_author TEXT,
  last_message_author_name TEXT,
  last_message_attachments INTEGER NOT NULL DEFAULT 0,
  last_contact_message_at INTEGER,
  last_agent_message_at INTEGER,
  contact_last_read_at INTEGER,
  agent_last_read_at INTEGER,
  contact_notified_at INTEGER,
  snoozed_until INTEGER,
  resolved_at INTEGER,
  rating_score INTEGER CHECK (rating_score IN (1, 2, 3)),
  rating_comment TEXT,
  rating_at INTEGER
);
CREATE INDEX conversations_status ON conversations(status, last_message_at DESC);
CREATE INDEX conversations_contact ON conversations(contact_id, last_message_at DESC);
CREATE INDEX conversations_assignee ON conversations(assignee_id, status, last_message_at DESC);
CREATE INDEX conversations_snoozed ON conversations(snoozed_until) WHERE status = 'snoozed';

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('contact', 'agent', 'system')),
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'note', 'event')),
  body TEXT NOT NULL DEFAULT '',
  event TEXT,
  client_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX messages_client ON messages(conversation_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  -- NULL until the upload is sent with a message; unsent uploads are purged after a day.
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id TEXT,
  uploader_type TEXT NOT NULL CHECK (uploader_type IN ('contact', 'agent')),
  uploader_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX attachments_message ON attachments(message_id);
CREATE INDEX attachments_conversation ON attachments(conversation_id);
CREATE INDEX attachments_pending ON attachments(created_at) WHERE message_id IS NULL;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE canned_responses (
  id TEXT PRIMARY KEY,
  shortcut TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

-- Full-text search over what people wrote (not system events).
CREATE VIRTUAL TABLE messages_fts USING fts5(body, content = 'messages', content_rowid = 'rowid');

CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages WHEN new.kind != 'event' BEGIN
  INSERT INTO messages_fts(rowid, body) VALUES (new.rowid, new.body);
END;

CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages WHEN old.kind != 'event' BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
