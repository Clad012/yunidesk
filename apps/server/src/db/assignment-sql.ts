// The SQL behind automatic assignment, kept apart so tests run the exact statements on SQLite.
import { can, type AgentRole } from "yunidesk";
import type { Candidate } from "../lib/assignment";

/** Members who can be picked, with their open conversations (every team). Binds: teamId. */
export const TEAM_CANDIDATES_SQL = `SELECT a.id, a.role, a.availability, a.max_open,
    (SELECT COUNT(*) FROM conversations c WHERE c.assignee_id = a.id AND c.status = 'open') AS open_count
  FROM team_members m JOIN agents a ON a.id = m.agent_id
  WHERE m.team_id = ? AND a.disabled_at IS NULL AND a.kind = 'human'`;

/**
 * Takes the team's turn: only while it is still the version we read and the conversation is still
 * unrouted. Binds: nextVersion, assigneeId (NULL keeps whose turn it was), teamId, expectedVersion, conversationId.
 */
export const CLAIM_TURN_SQL = `UPDATE teams SET assign_version = ?, last_assigned_agent_id = COALESCE(?, last_assigned_agent_id)
  WHERE id = ? AND assign_version = ?
    AND EXISTS (SELECT 1 FROM conversations WHERE id = ? AND assignee_id IS NULL AND team_id IS NULL)`;

/**
 * Routes the conversation, in the same transaction, only if the claim above won (the team now carries
 * our version). Binds: teamId, assigneeId, now, conversationId, teamId, nextVersion.
 */
export const APPLY_ROUTE_SQL = `UPDATE conversations SET team_id = ?, assignee_id = ?, updated_at = MAX(updated_at, ?)
  WHERE id = ? AND assignee_id IS NULL AND team_id IS NULL
    AND (SELECT assign_version FROM teams WHERE id = ?) = ?`;

export interface CandidateRow {
  id: string;
  role: AgentRole;
  availability: "available" | "away";
  max_open: number | null;
  open_count: number;
}

export function toCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    availability: row.availability,
    openCount: row.open_count,
    maxOpen: row.max_open,
    // Viewers are read-only: never hand them a conversation.
    canReply: can(row.role, "inbox.reply"),
  };
}
