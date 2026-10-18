-- Teams, teammate availability and automatic assignment rules. Team-only data: contacts never see any of it.

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  -- Round robin: who got the team's last automatic assignment.
  last_assigned_agent_id TEXT,
  -- A fresh random value on every automatic assignment. Writers compare-and-set it, so two
  -- conversations arriving at once can't both read the same turn and go to the same person.
  assign_version TEXT NOT NULL DEFAULT ''
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, agent_id)
);
CREATE INDEX team_members_agent ON team_members(agent_id);

ALTER TABLE conversations ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
-- The ?team= filter and the per-team open counts.
CREATE INDEX conversations_team ON conversations(team_id, status, last_message_at DESC);

-- 'away' teammates are never assigned automatically.
ALTER TABLE agents ADD COLUMN availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'away'));
-- Most open conversations a teammate gets automatically; NULL = no limit.
ALTER TABLE agents ADD COLUMN max_open INTEGER;

-- Ordered; the first rule whose conditions all match wins. Deleting a team deletes its rules.
CREATE TABLE assignment_rules (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- JSON: { channel, contact, tagId, attribute } (AssignmentConditions).
  conditions TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assign TEXT NOT NULL CHECK (assign IN ('round_robin', 'least_busy', 'none')),
  created_at INTEGER NOT NULL
);
