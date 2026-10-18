-- Tags, priority and custom fields on conversations. Team-only data: contacts never see any of it.

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- One of the dashboard's fixed palette names (TAG_COLORS).
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE conversation_tags (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, tag_id)
);
-- The ?tag= filter and the per-tag counts.
CREATE INDEX conversation_tags_tag ON conversation_tags(tag_id, conversation_id);

ALTER TABLE conversations ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
-- The ?priority= filter within a view (open, snoozed…), newest first.
CREATE INDEX conversations_priority ON conversations(status, priority, last_message_at DESC);

-- Values keyed by conversation_fields.key, e.g. {"plan":"pro","order_id":"A-1042"}.
ALTER TABLE conversations ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}';

CREATE TABLE conversation_fields (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'number', 'select', 'checkbox', 'date')),
  -- JSON array of choices, for type 'select' only.
  options TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
