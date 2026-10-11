-- AI assistant: knowledge it answers from, tools it may call, what it spent, and per-conversation state.

-- 1 for messages the AI assistant wrote (always shown as such to the customer).
ALTER TABLE messages ADD COLUMN ai INTEGER NOT NULL DEFAULT 0;

-- NULL: no assistant involved. 'active': it answers. 'handed_off': the customer asked for a person.
-- 'human': a teammate replied. 'off': the assistant was turned off.
ALTER TABLE conversations ADD COLUMN ai_state TEXT;
-- While a reply is being written, so two customer messages never start two replies at once.
ALTER TABLE conversations ADD COLUMN ai_lock_until INTEGER;

CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('faq', 'article')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, body, content = 'knowledge_items', content_rowid = 'rowid');

CREATE TRIGGER knowledge_fts_insert AFTER INSERT ON knowledge_items BEGIN
  INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER knowledge_fts_delete AFTER DELETE ON knowledge_items BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER knowledge_fts_update AFTER UPDATE ON knowledge_items BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE assistant_tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  -- JSON schema of its arguments.
  input_schema TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- What the assistant spent per UTC day, for the daily budget.
CREATE TABLE assistant_usage (
  day TEXT PRIMARY KEY,
  replies INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
