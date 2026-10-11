import { Hono } from "hono";
import { z } from "zod";
import type { AssistantSettings, AssistantTool, KnowledgeItem } from "yunidesk";
import { limit, publicOrigin, readBody, type AppContext, type AppEnv } from "../../app-env";
import { generateReply } from "../../lib/assistant/engine";
import { toKnowledgeItem, type KnowledgeRow } from "../../lib/assistant/knowledge";
import {
  getAssistant,
  openOpenRouterKey,
  saveAssistant,
  sealOpenRouterKey,
  sealToolSecret,
  toAssistantSettings,
} from "../../lib/assistant/settings";
import { TOOL_NAME, type AssistantToolRow } from "../../lib/assistant/tools";
import { recordUsage, spentToday, usageToday } from "../../lib/assistant/usage";
import { requireOwner } from "../../lib/agent-session";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { isAllowedWebhookUrl, newWebhookSecret } from "../../lib/webhooks";
import { ftsQuery } from "./inbox";

const MAX_KNOWLEDGE_ITEMS = 2000;
const MAX_TOOLS = 20;

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  instructions: z.string().max(8000).optional(),
  model: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i, "Use an OpenRouter model id, like z-ai/glm-5.3-flash")
    .max(100)
    .optional(),
  allowAnonymous: z.boolean().optional(),
  dailyBudgetUsd: z.number().min(0).max(1000).optional(),
});
const keySchema = z.object({ key: z.string().trim().min(20).max(200).startsWith("sk-or-", "OpenRouter keys start with sk-or-") });
const knowledgeSchema = z.object({
  kind: z.enum(["faq", "article"]),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});
const inputSchemaSchema = z
  .record(z.string(), z.unknown())
  .refine((schema) => schema.type === "object", "The input schema must have type \"object\"")
  .refine((schema) => JSON.stringify(schema).length <= 8000, "The input schema is too large");
const toolSchema = z.object({
  name: z.string().regex(TOOL_NAME, "Use snake_case: letters, digits and _, starting with a letter"),
  description: z.string().trim().min(1).max(1000),
  inputSchema: inputSchemaSchema,
  url: z.url({ protocol: /^https$/ }).max(500),
  enabled: z.boolean().default(true),
});
const previewSchema = z.object({ message: z.string().trim().min(1).max(2000) });

/** The AI assistant's settings, knowledge and tools. Writes: owners (dashboard) or keys with assistant:write. */
export const assistantRoutes = new Hono<AppEnv>();

function requireWriter(c: AppContext): void {
  if (!c.get("apiKey")) requireOwner(c.get("agent"));
}

function toAssistantTool(row: AssistantToolRow): AssistantTool {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inputSchema: JSON.parse(row.input_schema) as Record<string, unknown>,
    url: row.url,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertToolUrl(c: AppContext, url: string): void {
  if (!isAllowedWebhookUrl(url, new URL(c.req.url).hostname)) {
    throw badRequest("Use a public https address (no IPs, localhost or workers.dev)");
  }
}

// ---- Settings ----

assistantRoutes.get("/", async (c) => c.json<AssistantSettings>(toAssistantSettings(await getAssistant(c.env))));

assistantRoutes.patch("/", async (c) => {
  requireWriter(c);
  const patch = await readBody(c, settingsSchema);
  const saved = await saveAssistant(c.env, patch);
  // Turned off: conversations it was answering go to the team as they are.
  if (patch.enabled === false) {
    await c.env.DB.prepare("UPDATE conversations SET ai_state = 'off', ai_lock_until = NULL WHERE ai_state = 'active'").run();
  }
  return c.json(toAssistantSettings(saved));
});

/** Checked against OpenRouter before it is stored (sealed); never returned. */
assistantRoutes.put("/openrouter-key", async (c) => {
  requireWriter(c);
  const { key } = await readBody(c, keySchema);
  const check = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!check) throw badRequest("OpenRouter could not be reached; try again");
  if (check.status === 401 || check.status === 403) throw badRequest("OpenRouter refused this key");
  if (!check.ok) throw badRequest(`OpenRouter answered HTTP ${check.status}; try again`);
  const saved = await saveAssistant(c.env, { openRouterKeySealed: await sealOpenRouterKey(c.env, key) });
  return c.json(toAssistantSettings(saved));
});

assistantRoutes.delete("/openrouter-key", async (c) => {
  requireWriter(c);
  return c.json(toAssistantSettings(await saveAssistant(c.env, { openRouterKeySealed: null })));
});

assistantRoutes.get("/usage", async (c) => {
  const stored = await getAssistant(c.env);
  return c.json(await usageToday(c.env, stored.dailyBudgetUsd));
});

/** A test question from the dashboard: same knowledge, tools and model; nothing saved or sent. */
assistantRoutes.post("/preview", async (c) => {
  requireWriter(c);
  const agent = c.get("agent");
  await limit(c.env.ASSISTANT_LIMITER, `preview:${agent.id}`);
  const { message } = await readBody(c, previewSchema);
  const stored = await getAssistant(c.env);
  const apiKey = await openOpenRouterKey(c.env, stored);
  if (!apiKey) throw badRequest("Add an OpenRouter key first");
  if ((await spentToday(c.env)) >= stored.dailyBudgetUsd) throw badRequest("Today's budget is used up");
  const reply = await generateReply({
    env: c.env,
    stored,
    apiKey,
    question: message,
    history: [{ role: "user", content: message }],
    conversationId: "preview",
    // As a signed-in customer the assistant knows nothing else about.
    contact: { id: "preview", externalId: null, email: null, name: null, isIdentified: true },
    ownHost: new URL(publicOrigin(c)).hostname,
  });
  c.executionCtx.waitUntil(recordUsage(c.env, reply.costUsd, { reply: false }));
  return c.json({ reply: reply.text, sources: reply.sources, toolCalls: reply.toolCalls });
});

// ---- Knowledge ----

assistantRoutes.get("/knowledge", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 200);
  const words = q ? ftsQuery(q) : null;
  const { results } = words
    ? await c.env.DB.prepare(
        `SELECT k.* FROM knowledge_fts f JOIN knowledge_items k ON k.rowid = f.rowid
         WHERE knowledge_fts MATCH ? ORDER BY bm25(knowledge_fts, 5.0, 1.0) LIMIT 200`,
      )
        .bind(words)
        .all<KnowledgeRow>()
    : await c.env.DB.prepare("SELECT * FROM knowledge_items ORDER BY updated_at DESC LIMIT 500").all<KnowledgeRow>();
  return c.json({ items: results.map(toKnowledgeItem) });
});

assistantRoutes.post("/knowledge", async (c) => {
  requireWriter(c);
  const input = await readBody(c, knowledgeSchema);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM knowledge_items").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_KNOWLEDGE_ITEMS) throw conflict(`At most ${MAX_KNOWLEDGE_ITEMS} knowledge items`);
  const now = Date.now();
  const id = newId("kno");
  await c.env.DB.prepare("INSERT INTO knowledge_items (id, kind, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, input.kind, input.title, input.body, now, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM knowledge_items WHERE id = ?").bind(id).first<KnowledgeRow>();
  return c.json<KnowledgeItem>(toKnowledgeItem(row!), 201);
});

assistantRoutes.patch("/knowledge/:id", async (c) => {
  requireWriter(c);
  const input = await readBody(c, knowledgeSchema.partial());
  const row = await c.env.DB.prepare("SELECT * FROM knowledge_items WHERE id = ?").bind(c.req.param("id")).first<KnowledgeRow>();
  if (!row) throw notFound("Knowledge item not found");
  await c.env.DB.prepare("UPDATE knowledge_items SET kind = ?, title = ?, body = ?, updated_at = ? WHERE id = ?")
    .bind(input.kind ?? row.kind, input.title ?? row.title, input.body ?? row.body, Date.now(), row.id)
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM knowledge_items WHERE id = ?").bind(row.id).first<KnowledgeRow>();
  return c.json(toKnowledgeItem(updated!));
});

assistantRoutes.delete("/knowledge/:id", async (c) => {
  requireWriter(c);
  const result = await c.env.DB.prepare("DELETE FROM knowledge_items WHERE id = ?").bind(c.req.param("id")).run();
  if (!result.meta.changes) throw notFound("Knowledge item not found");
  return c.json({ ok: true });
});

// ---- Tools ----

assistantRoutes.get("/tools", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM assistant_tools ORDER BY name").all<AssistantToolRow>();
  return c.json({ items: results.map(toAssistantTool) });
});

assistantRoutes.post("/tools", async (c) => {
  requireWriter(c);
  const input = await readBody(c, toolSchema);
  assertToolUrl(c, input.url);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM assistant_tools").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TOOLS) throw conflict(`At most ${MAX_TOOLS} tools`);
  if (await c.env.DB.prepare("SELECT 1 FROM assistant_tools WHERE name = ?").bind(input.name).first()) {
    throw conflict(`A tool named ${input.name} already exists`);
  }
  const now = Date.now();
  const id = newId("tol");
  await c.env.DB.prepare(
    "INSERT INTO assistant_tools (id, name, description, input_schema, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, input.name, input.description, JSON.stringify(input.inputSchema), input.url, input.enabled ? 1 : 0, now, now)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM assistant_tools WHERE id = ?").bind(id).first<AssistantToolRow>();
  return c.json(toAssistantTool(row!), 201);
});

assistantRoutes.patch("/tools/:id", async (c) => {
  requireWriter(c);
  const input = await readBody(c, toolSchema.partial());
  const row = await c.env.DB.prepare("SELECT * FROM assistant_tools WHERE id = ?").bind(c.req.param("id")).first<AssistantToolRow>();
  if (!row) throw notFound("Tool not found");
  if (input.url) assertToolUrl(c, input.url);
  if (input.name && input.name !== row.name) {
    if (await c.env.DB.prepare("SELECT 1 FROM assistant_tools WHERE name = ?").bind(input.name).first()) {
      throw conflict(`A tool named ${input.name} already exists`);
    }
  }
  await c.env.DB.prepare(
    "UPDATE assistant_tools SET name = ?, description = ?, input_schema = ?, url = ?, enabled = ?, updated_at = ? WHERE id = ?",
  )
    .bind(
      input.name ?? row.name,
      input.description ?? row.description,
      input.inputSchema ? JSON.stringify(input.inputSchema) : row.input_schema,
      input.url ?? row.url,
      input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0,
      Date.now(),
      row.id,
    )
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM assistant_tools WHERE id = ?").bind(row.id).first<AssistantToolRow>();
  return c.json(toAssistantTool(updated!));
});

assistantRoutes.delete("/tools/:id", async (c) => {
  requireWriter(c);
  const result = await c.env.DB.prepare("DELETE FROM assistant_tools WHERE id = ?").bind(c.req.param("id")).run();
  if (!result.meta.changes) throw notFound("Tool not found");
  return c.json({ ok: true });
});

/** A new secret for signing tool calls, shown once. The old one stops at once. */
assistantRoutes.post("/tools/roll-secret", async (c) => {
  requireWriter(c);
  const secret = newWebhookSecret();
  await saveAssistant(c.env, { toolSecretSealed: await sealToolSecret(c.env, secret) });
  return c.json({ secret });
});
