import { MAX_TEAM_NAME_LENGTH, type AssignmentRule, type AssignmentSettings, type AssignStrategy, type Team, type TeamMember, type TeamRef, type Teammate } from "yunidesk";
import type { Env } from "../env";
import type { AgentRow, AssignmentRuleRow, TeamRow } from "./rows";
import { toPublicAgent } from "./serialize";
import { cleanName } from "./tags";

export function normalizeTeamName(input: string): string | null {
  return cleanName(input, MAX_TEAM_NAME_LENGTH);
}

export function toTeammate(row: Pick<AgentRow, "id" | "name" | "avatar_url" | "kind" | "availability">): Teammate {
  return { ...toPublicAgent(row), availability: row.availability === "away" ? "away" : "available" };
}

/** Every team's id and name (there are at most a few dozen). */
export async function loadTeamRefs(env: Env): Promise<Map<string, TeamRef>> {
  const { results } = await env.DB.prepare("SELECT id, name FROM teams").all<Pick<TeamRow, "id" | "name">>();
  return new Map(results.map((row) => [row.id, { id: row.id, name: row.name }]));
}

/** Teams, alphabetical, with members (signed-in humans), their load and the team's open counts. */
export async function loadTeams(env: Env): Promise<Team[]> {
  const [teams, members, counts, load] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM teams ORDER BY name COLLATE NOCASE"),
    env.DB.prepare(
      `SELECT m.team_id, a.* FROM team_members m JOIN agents a ON a.id = m.agent_id
       WHERE a.disabled_at IS NULL AND a.kind = 'human' ORDER BY a.name COLLATE NOCASE`,
    ),
    env.DB.prepare(
      `SELECT team_id, COUNT(*) AS open_count, COALESCE(SUM(assignee_id IS NULL), 0) AS unassigned_count
       FROM conversations WHERE status = 'open' AND team_id IS NOT NULL GROUP BY team_id`,
    ),
    env.DB.prepare(
      "SELECT assignee_id, COUNT(*) AS n FROM conversations WHERE status = 'open' AND assignee_id IS NOT NULL GROUP BY assignee_id",
    ),
  ]);
  const openByAgent = new Map((load!.results as { assignee_id: string; n: number }[]).map((r) => [r.assignee_id, r.n]));
  const countsByTeam = new Map(
    (counts!.results as { team_id: string; open_count: number; unassigned_count: number }[]).map((r) => [r.team_id, r]),
  );
  const membersByTeam = new Map<string, TeamMember[]>();
  for (const row of members!.results as (AgentRow & { team_id: string })[]) {
    const list = membersByTeam.get(row.team_id) ?? [];
    list.push({ ...toTeammate(row), openCount: openByAgent.get(row.id) ?? 0, maxOpen: row.max_open });
    membersByTeam.set(row.team_id, list);
  }
  return (teams!.results as TeamRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    members: membersByTeam.get(row.id) ?? [],
    openCount: countsByTeam.get(row.id)?.open_count ?? 0,
    unassignedCount: countsByTeam.get(row.id)?.unassigned_count ?? 0,
    createdAt: row.created_at,
  }));
}

// ---- Rules and the fallback (owner settings) ----

const FALLBACK_KEY = "assignment";

export function toAssignmentRule(row: AssignmentRuleRow): AssignmentRule {
  const conditions = JSON.parse(row.conditions) as Partial<AssignmentRule["conditions"]>;
  return {
    id: row.id,
    name: row.name,
    conditions: {
      channel: conditions.channel ?? "any",
      language: conditions.language ?? "any",
      contact: conditions.contact ?? "any",
      tagId: conditions.tagId ?? null,
      attribute: conditions.attribute ?? null,
    },
    teamId: row.team_id,
    assign: row.assign,
  };
}

export async function loadAssignment(env: Env): Promise<AssignmentSettings> {
  const [rules, fallback] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM assignment_rules ORDER BY position, created_at"),
    env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(FALLBACK_KEY),
  ]);
  const stored = (fallback!.results[0] as { value: string } | undefined)?.value;
  const parsed = stored ? (JSON.parse(stored) as Partial<AssignmentSettings["fallback"]>) : {};
  return {
    rules: (rules!.results as AssignmentRuleRow[]).map(toAssignmentRule),
    fallback: { teamId: parsed.teamId ?? null, assign: parsed.assign ?? "none" },
  };
}

export function saveFallbackStatement(env: Env, fallback: { teamId: string | null; assign: AssignStrategy }): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(FALLBACK_KEY, JSON.stringify(fallback), Date.now());
}

/** Clears the fallback when it pointed at a team that is being deleted. */
export function clearFallbackTeamStatement(env: Env, teamId: string): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE settings SET value = json_object('teamId', NULL, 'assign', 'none'), updated_at = ?
     WHERE key = ? AND json_extract(value, '$.teamId') = ?`,
  ).bind(Date.now(), FALLBACK_KEY, teamId);
}
