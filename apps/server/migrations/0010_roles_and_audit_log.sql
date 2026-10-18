-- Roles (owner, admin, agent, viewer) and the audit log.
--
-- SQLite can't change a CHECK constraint, so agents and agent_invites are rebuilt.
--
-- agents is the parent of several foreign keys, and D1 keeps foreign keys on during migrations:
-- dropping it deletes every session (ON DELETE CASCADE) and clears conversation assignees and
-- message authors (ON DELETE SET NULL), even with deferred checks. Renaming it instead would
-- repoint those foreign keys at the renamed copy. So: keep copies of what the drop would touch,
-- drop, put the new table in place under the same name, refill it, then restore the copies.
PRAGMA defer_foreign_keys = on;

CREATE TABLE agents_rebuilt (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  password_hash TEXT NOT NULL,
  disabled_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  kind TEXT NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'bot'))
);

CREATE TABLE roles_keep_agents AS SELECT * FROM agents;
CREATE TABLE roles_keep_sessions AS SELECT * FROM agent_sessions;
CREATE TABLE roles_keep_assignees AS SELECT id, assignee_id FROM conversations WHERE assignee_id IS NOT NULL;
CREATE TABLE roles_keep_authors AS SELECT id, agent_id FROM messages WHERE agent_id IS NOT NULL;

DROP TABLE agents;
ALTER TABLE agents_rebuilt RENAME TO agents;

-- Inserted after the rename, so the rows api_keys points at exist again before the deferred check.
INSERT INTO agents (id, email, name, avatar_url, role, password_hash, disabled_at, created_at, last_seen_at, kind)
  SELECT id, email, name, avatar_url, role, password_hash, disabled_at, created_at, last_seen_at, kind FROM roles_keep_agents;
INSERT INTO agent_sessions (token_hash, agent_id, created_at, expires_at, user_agent)
  SELECT token_hash, agent_id, created_at, expires_at, user_agent FROM roles_keep_sessions;
UPDATE conversations SET assignee_id = (SELECT k.assignee_id FROM roles_keep_assignees k WHERE k.id = conversations.id)
  WHERE id IN (SELECT id FROM roles_keep_assignees);
UPDATE messages SET agent_id = (SELECT k.agent_id FROM roles_keep_authors k WHERE k.id = messages.id)
  WHERE id IN (SELECT id FROM roles_keep_authors);

DROP TABLE roles_keep_agents;
DROP TABLE roles_keep_sessions;
DROP TABLE roles_keep_assignees;
DROP TABLE roles_keep_authors;

-- Nothing references agent_invites: a plain copy and swap.
CREATE TABLE agent_invites_rebuilt (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER
);
INSERT INTO agent_invites_rebuilt (id, token_hash, email, role, created_by, created_at, expires_at, accepted_at)
  SELECT id, token_hash, email, role, created_by, created_at, expires_at, accepted_at FROM agent_invites;
DROP TABLE agent_invites;
ALTER TABLE agent_invites_rebuilt RENAME TO agent_invites;

-- Who did what. Never holds passwords, secrets or the content of erased contacts.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'api_key', 'system')),
  -- Agent or API key id; NULL for the system and for failed sign-ins with an unknown email.
  actor_id TEXT,
  -- Name at the time (the email for sign-in attempts), so entries stay readable after changes.
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  -- JSON object: which settings changed, the old and new role, a failure reason…
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_log_created ON audit_log(created_at DESC);
CREATE INDEX audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX audit_log_actor ON audit_log(actor_id, created_at DESC);
