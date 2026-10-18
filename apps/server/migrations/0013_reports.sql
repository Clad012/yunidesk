-- Reports: per-conversation facts kept up to date on every write, so a report reads the
-- conversations table (through the indexes below) and never scans every message.

-- The contact's first message (text, attachments included).
ALTER TABLE conversations ADD COLUMN first_contact_message_at INTEGER;
-- The first reply a person on the team sent after it. AI replies, notes, events and API-key bots
-- don't count. First response time = first_human_reply_at - first_contact_message_at.
ALTER TABLE conversations ADD COLUMN first_human_reply_at INTEGER;
-- 1 once a person on the team sent the customer a reply (at any time).
ALTER TABLE conversations ADD COLUMN human_replied INTEGER NOT NULL DEFAULT 0;
-- 1 once the AI assistant replied or handed the conversation to the team.
ALTER TABLE conversations ADD COLUMN ai_involved INTEGER NOT NULL DEFAULT 0;
-- How many times it left "resolved" (a teammate reopened it or the customer wrote again).
ALTER TABLE conversations ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;

-- Backfill from the messages already stored.
UPDATE conversations SET first_contact_message_at = m.at
FROM (
  SELECT conversation_id, MIN(created_at) AS at FROM messages
  WHERE author_type = 'contact' AND kind = 'text'
  GROUP BY conversation_id
) AS m
WHERE m.conversation_id = conversations.id;

-- Replies whose author was since deleted (agent_id NULL) were written by people: bots are never deleted.
UPDATE conversations SET first_human_reply_at = m.at
FROM (
  SELECT r.conversation_id, MIN(r.created_at) AS at
  FROM messages r
  JOIN conversations c ON c.id = r.conversation_id
  LEFT JOIN agents a ON a.id = r.agent_id
  WHERE r.author_type = 'agent' AND r.kind = 'text' AND r.ai = 0 AND COALESCE(a.kind, 'human') = 'human'
    AND c.first_contact_message_at IS NOT NULL AND r.created_at >= c.first_contact_message_at
  GROUP BY r.conversation_id
) AS m
WHERE m.conversation_id = conversations.id;

UPDATE conversations SET human_replied = 1
FROM (
  SELECT DISTINCT r.conversation_id
  FROM messages r LEFT JOIN agents a ON a.id = r.agent_id
  WHERE r.author_type = 'agent' AND r.kind = 'text' AND r.ai = 0 AND COALESCE(a.kind, 'human') = 'human'
) AS m
WHERE m.conversation_id = conversations.id;

UPDATE conversations SET ai_involved = 1
FROM (
  SELECT DISTINCT conversation_id FROM messages
  WHERE ai = 1 OR (kind = 'event' AND json_extract(event, '$.type') = 'handed_off')
) AS m
WHERE m.conversation_id = conversations.id;

-- Every "resolved" event but the one it is still resolved by was followed by a reopen.
UPDATE conversations SET reopened_count = MAX(0, m.resolves - (conversations.status = 'resolved'))
FROM (
  SELECT conversation_id, COUNT(*) AS resolves FROM messages
  WHERE kind = 'event' AND json_extract(event, '$.type') = 'resolved'
  GROUP BY conversation_id
) AS m
WHERE m.conversation_id = conversations.id;

-- Range scans: created, resolved and rated in a period.
CREATE INDEX conversations_created ON conversations(created_at);
CREATE INDEX conversations_resolved ON conversations(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX conversations_rated ON conversations(rating_at) WHERE rating_at IS NOT NULL;
-- "Replied" per teammate: only the team's own replies, by time.
CREATE INDEX messages_team_replies ON messages(created_at) WHERE author_type = 'agent' AND kind = 'text' AND ai = 0;
