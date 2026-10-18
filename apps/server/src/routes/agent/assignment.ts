import { Hono } from "hono";
import { z } from "zod";
import { ASSIGN_STRATEGIES, AVAILABILITIES, MAX_ASSIGNMENT_RULES, RULE_CHANNELS, type AssignmentSettings } from "yunidesk";
import { readBody, type AppEnv } from "../../app-env";
import type { AgentRow } from "../../db/rows";
import { toAgent } from "../../db/serialize";
import { loadAssignment, saveFallbackStatement, toTeammate } from "../../db/teams";
import { requireOwner } from "../../lib/agent-session";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { notifyAgents } from "../../lib/realtime";

const RULE_ID = /^rul_[0-9a-z]{26}$/;

const conditionsSchema = z.object({
  channel: z.enum(RULE_CHANNELS).default("any"),
  contact: z.enum(["any", "identified", "anonymous"]).default("any"),
  tagId: z.string().max(64).nullable().default(null),
  attribute: z.object({ key: z.string().trim().min(1).max(64), value: z.string().trim().max(200) }).nullable().default(null),
});
const ruleSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(80),
  conditions: conditionsSchema,
  teamId: z.string().max(64),
  assign: z.enum(ASSIGN_STRATEGIES),
});
const assignmentSchema = z.object({
  rules: z.array(ruleSchema).max(MAX_ASSIGNMENT_RULES),
  fallback: z.object({ teamId: z.string().max(64).nullable(), assign: z.enum(ASSIGN_STRATEGIES) }),
});
const capacitySchema = z.object({ maxOpen: z.number().int().min(1).max(1000).nullable() });
const availabilitySchema = z.object({ availability: z.enum(AVAILABILITIES) });

// ---- /assignment: the rules and the fallback (read by teammates, changed by owners; never keys) ----

export const assignmentRoutes = new Hono<AppEnv>();

assignmentRoutes.get("/", async (c) => c.json<AssignmentSettings>(await loadAssignment(c.env)));

/** Replaces the whole ordered list, so reordering and editing are one atomic save. */
assignmentRoutes.put("/", async (c) => {
  requireOwner(c.get("agent"));
  const input = await readBody(c, assignmentSchema);
  const [teams, tags] = await c.env.DB.batch([c.env.DB.prepare("SELECT id FROM teams"), c.env.DB.prepare("SELECT id FROM tags")]);
  const teamIds = new Set((teams!.results as { id: string }[]).map((t) => t.id));
  const tagIds = new Set((tags!.results as { id: string }[]).map((t) => t.id));
  if (input.fallback.teamId !== null && !teamIds.has(input.fallback.teamId)) throw badRequest("fallback: unknown team");
  const seen = new Set<string>();
  const rows = input.rules.map((rule, index) => {
    if (!teamIds.has(rule.teamId)) throw badRequest(`rules.${index}: unknown team`);
    if (rule.conditions.tagId !== null && !tagIds.has(rule.conditions.tagId)) throw badRequest(`rules.${index}: unknown tag`);
    const id = rule.id && RULE_ID.test(rule.id) && !seen.has(rule.id) ? rule.id : newId("rul");
    seen.add(id);
    return { ...rule, id, position: index };
  });
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM assignment_rules"),
    ...rows.map((rule) =>
      c.env.DB.prepare(
        "INSERT INTO assignment_rules (id, position, name, conditions, team_id, assign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(rule.id, rule.position, rule.name, JSON.stringify(rule.conditions), rule.teamId, rule.assign, now),
    ),
    saveFallbackStatement(c.env, { teamId: input.fallback.teamId, assign: input.fallback.teamId ? input.fallback.assign : "none" }),
  ]);
  return c.json<AssignmentSettings>(await loadAssignment(c.env));
});

/** A teammate's limit of open conversations from automatic assignment (null: none). */
assignmentRoutes.patch("/teammates/:id", async (c) => {
  requireOwner(c.get("agent"));
  const { maxOpen } = await readBody(c, capacitySchema);
  const row = await c.env.DB.prepare("UPDATE agents SET max_open = ? WHERE id = ? AND kind = 'human' RETURNING *")
    .bind(maxOpen, c.req.param("id"))
    .first<AgentRow>();
  if (!row) throw notFound("Teammate not found");
  return c.json({ ...toTeammate(row), maxOpen: row.max_open });
});

// ---- /me/availability: available or away (the signed-in teammate) ----

export const availabilityRoutes = new Hono<AppEnv>();

availabilityRoutes.put("/", async (c) => {
  const agent = c.get("agent");
  const { availability } = await readBody(c, availabilitySchema);
  const row = await c.env.DB.prepare("UPDATE agents SET availability = ? WHERE id = ? RETURNING *").bind(availability, agent.id).first<AgentRow>();
  c.executionCtx.waitUntil(notifyAgents(c.env, { type: "availability", agentId: agent.id, availability }));
  return c.json({ agent: toAgent(row!) });
});
