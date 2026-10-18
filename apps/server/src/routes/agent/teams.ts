import { Hono } from "hono";
import { z } from "zod";
import { MAX_TEAMS, type Team } from "yunidesk";
import { limit, readBody, type AppEnv } from "../../app-env";
import type { AgentRow, TeamRow } from "../../db/rows";
import { clearFallbackTeamStatement, loadTeams, normalizeTeamName } from "../../db/teams";
import { requireOwner } from "../../lib/agent-session";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

const nameSchema = z.string().max(200).transform((value, ctx) => {
  const name = normalizeTeamName(value);
  if (!name) ctx.addIssue({ code: "custom", message: "Use 1 to 40 characters" });
  return name ?? "";
});
const teamSchema = z.object({ name: nameSchema });

async function teamOr404(env: AppEnv["Bindings"], id: string): Promise<Team> {
  const team = (await loadTeams(env)).find((t) => t.id === id);
  if (!team) throw notFound("Team not found");
  return team;
}

function uniqueName(error: unknown): never {
  if (String(error).includes("UNIQUE")) throw conflict("A team with this name already exists");
  throw error;
}

// ---- /teams: everyone (and keys with conversations:read) reads; owners manage ----

export const teamsRoutes = new Hono<AppEnv>();

teamsRoutes.get("/", async (c) => c.json({ items: await loadTeams(c.env) }));

teamsRoutes.post("/", async (c) => {
  requireOwner(c.get("agent"));
  await limit(c.env.WRITE_LIMITER, `agent:${c.get("agent").id}`);
  const { name } = await readBody(c, teamSchema);
  const id = newId("tem");
  // Insert only while under the cap, in one statement.
  const inserted = await c.env.DB.prepare(
    "INSERT INTO teams (id, name, created_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM teams) < ?",
  )
    .bind(id, name, Date.now(), MAX_TEAMS)
    .run()
    .catch(uniqueName);
  if (!inserted.meta.changes) throw badRequest(`Up to ${MAX_TEAMS} teams`);
  return c.json(await teamOr404(c.env, id), 201);
});

teamsRoutes.patch("/:id", async (c) => {
  requireOwner(c.get("agent"));
  const { name } = await readBody(c, teamSchema);
  const row = await c.env.DB.prepare("UPDATE teams SET name = ? WHERE id = ? RETURNING *")
    .bind(name, c.req.param("id"))
    .first<TeamRow>()
    .catch(uniqueName);
  if (!row) throw notFound("Team not found");
  return c.json(await teamOr404(c.env, row.id));
});

/** Its conversations leave the team (assignees stay), its rules go, and so does the fallback to it. */
teamsRoutes.delete("/:id", async (c) => {
  requireOwner(c.get("agent"));
  const id = c.req.param("id");
  await c.env.DB.batch([clearFallbackTeamStatement(c.env, id), c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(id)]);
  return c.json({ ok: true });
});

teamsRoutes.put("/:id/members/:agentId", async (c) => {
  requireOwner(c.get("agent"));
  const id = c.req.param("id");
  const member = await c.env.DB.prepare("SELECT id FROM agents WHERE id = ? AND kind = 'human' AND disabled_at IS NULL")
    .bind(c.req.param("agentId"))
    .first<Pick<AgentRow, "id">>();
  if (!member) throw badRequest("Unknown teammate");
  const team = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ?").bind(id).first();
  if (!team) throw notFound("Team not found");
  await c.env.DB.prepare("INSERT OR IGNORE INTO team_members (team_id, agent_id, created_at) VALUES (?, ?, ?)")
    .bind(id, member.id, Date.now())
    .run();
  return c.json(await teamOr404(c.env, id));
});

teamsRoutes.delete("/:id/members/:agentId", async (c) => {
  requireOwner(c.get("agent"));
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND agent_id = ?").bind(id, c.req.param("agentId")).run();
  return c.json(await teamOr404(c.env, id));
});
