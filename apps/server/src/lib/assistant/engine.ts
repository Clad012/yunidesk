import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import type { AssistantToolCall } from "yunidesk";
import type { Env } from "../../env";
import { getConversation, handOffToTeam, postAssistantMessage } from "../../db/conversations";
import type { AgentRow, ContactRow, MessageRow } from "../../db/rows";
import { notifyContact } from "../realtime";
import { getSettings } from "../settings";
import { searchKnowledge, type KnowledgeRow } from "./knowledge";
import { buildSystemPrompt, reasoningFor } from "./prompt";
import { getAssistant, isAssistantReady, openOpenRouterKey, openToolSecret, saveAssistant, type StoredAssistant } from "./settings";
import { buildTools, type AssistantToolRow, type ToolCallRecord } from "./tools";
import { recordUsage, spentToday } from "./usage";

const HISTORY_MESSAGES = 20;
const MAX_OUTPUT_TOKENS = 700;
const MAX_STEPS = 4;
const REPLY_TIMEOUT_MS = 45_000;
const LOCK_MS = 60_000;
const DELTA_EVERY_MS = 120;
/** Most assistant replies to one contact per UTC day. */
const MAX_REPLIES_PER_CONTACT_PER_DAY = 40;

export interface ReplyResult {
  text: string;
  sources: { id: string; title: string }[];
  toolCalls: ToolCallRecord[];
  costUsd: number;
}

/** One reply: knowledge search, the model with the owner's tools, streamed to `onText`. */
export async function generateReply(input: {
  env: Env;
  stored: StoredAssistant;
  apiKey: string;
  question: string;
  history: ModelMessage[];
  conversationId: string;
  contact: AssistantToolCall["contact"];
  ownHost: string;
  onText?: (text: string) => void;
}): Promise<ReplyResult> {
  const [knowledge, settings, toolRows, toolSecret] = await Promise.all([
    searchKnowledge(input.env, input.question),
    getSettings(input.env),
    input.env.DB.prepare("SELECT * FROM assistant_tools WHERE enabled = 1 ORDER BY name").all<AssistantToolRow>(),
    openToolSecret(input.env, input.stored),
  ]);
  const toolCalls: ToolCallRecord[] = [];
  const tools = buildTools(toolRows.results, {
    secret: toolSecret,
    ownHost: input.ownHost,
    conversationId: input.conversationId,
    contact: input.contact,
    calls: toolCalls,
  });
  const openrouter = createOpenRouter({ apiKey: input.apiKey, appName: "Yunidesk" });
  const result = streamText({
    model: openrouter(input.stored.model, { usage: { include: true } }),
    system: buildSystemPrompt({
      assistantName: input.stored.name,
      teamName: settings.teamName,
      instructions: input.stored.instructions,
      knowledge,
      customer: { name: input.contact.name, isIdentified: input.contact.isIdentified },
      hasTools: Object.keys(tools).length > 0,
    }),
    messages: input.history,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    providerOptions: { openrouter: { reasoning: reasoningFor(input.stored.model) } },
  });
  let text = "";
  for await (const part of result.textStream) {
    text += part;
    input.onText?.(text);
  }
  // Each step (one per tool round) is billed: add them all up.
  const steps = await result.steps;
  const costUsd = steps.reduce((sum, step) => {
    const usage = (step.providerMetadata as { openrouter?: { usage?: { cost?: number } } } | undefined)?.openrouter?.usage;
    return sum + (typeof usage?.cost === "number" ? usage.cost : 0);
  }, 0);
  return {
    text: text.trim(),
    sources: knowledge.map((row: KnowledgeRow) => ({ id: row.id, title: row.title })),
    toolCalls,
    costUsd,
  };
}

function toHistory(rows: MessageRow[]): ModelMessage[] {
  return rows
    .filter((row) => row.kind === "text" && row.body.trim())
    .map((row) =>
      row.author_type === "contact"
        ? { role: "user" as const, content: row.body }
        : { role: "assistant" as const, content: row.body },
    );
}

/** The bot teammate the assistant writes as, created on first use and kept in its name. */
async function assistantAgent(env: Env, stored: StoredAssistant): Promise<AgentRow> {
  if (stored.agentId) {
    const row = await env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(stored.agentId).first<AgentRow>();
    if (row) {
      if (row.name !== stored.name) {
        await env.DB.prepare("UPDATE agents SET name = ? WHERE id = ?").bind(stored.name, row.id).run();
        return { ...row, name: stored.name };
      }
      return row;
    }
  }
  const id = `agt_assistant${crypto.randomUUID().replace(/-/g, "").slice(0, 13)}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO agents (id, email, name, avatar_url, role, kind, password_hash, created_at)
     VALUES (?, ?, ?, NULL, 'agent', 'bot', ?, ?)`,
  )
    .bind(id, `${id}@assistant.yunidesk.invalid`, stored.name, `!${crypto.randomUUID()}`, now)
    .run();
  await saveAssistant(env, { agentId: id });
  return (await env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>())!;
}

async function repliesToContactToday(env: Env, contactId: string): Promise<number> {
  const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.contact_id = ? AND m.ai = 1 AND m.created_at >= ?`,
  )
    .bind(contactId, dayStart)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * After a customer writes: the assistant answers when it is on, the conversation is still its own
 * and every limit allows it. Anything that stops it (budget, rate, an error) hands the
 * conversation to the team instead, so the customer is never left waiting on a silent bot.
 */
export async function runAssistantTurn(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversationId: string,
  /** The customer's IP, so anonymous visitors can't dodge the limit with fresh sessions. */
  ip: string | null = null,
): Promise<void> {
  const stored = await getAssistant(env);
  if (!isAssistantReady(stored)) return;
  let conversation = await getConversation(env, conversationId);
  if (conversation.ai_state !== null && conversation.ai_state !== "active") return;
  if (conversation.last_message_author !== "contact") return;
  const contact = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(conversation.contact_id).first<ContactRow>();
  if (!contact) return;
  if (!contact.is_identified && !stored.allowAnonymous) return;

  const now = Date.now();
  const claimed = await env.DB.prepare(
    `UPDATE conversations SET ai_state = 'active', ai_lock_until = ?
     WHERE id = ? AND (ai_state IS NULL OR ai_state = 'active') AND (ai_lock_until IS NULL OR ai_lock_until < ?)`,
  )
    .bind(now + LOCK_MS, conversationId, now)
    .run();
  // Another reply is being written; it reads the whole conversation, this message included.
  if (!claimed.meta.changes) return;
  conversation = await getConversation(env, conversationId);

  const handOff = () => handOffToTeam(env, ctx, origin, conversation).then(() => undefined);
  const { success } = await env.ASSISTANT_LIMITER.limit({ key: `contact:${contact.id}` });
  const ipAllowed =
    contact.is_identified === 1 || !ip ? true : (await env.ASSISTANT_LIMITER.limit({ key: `ip:${ip}` })).success;
  if (
    !success ||
    !ipAllowed ||
    (await repliesToContactToday(env, contact.id)) >= MAX_REPLIES_PER_CONTACT_PER_DAY ||
    (await spentToday(env)) >= stored.dailyBudgetUsd
  ) {
    await handOff();
    return;
  }
  const apiKey = await openOpenRouterKey(env, stored);
  if (!apiKey) return;

  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? AND kind = 'text' ORDER BY created_at DESC, id DESC LIMIT ?",
  )
    .bind(conversationId, HISTORY_MESSAGES)
    .all<MessageRow>();
  const history = toHistory(results.reverse());
  // What to look up: everything the customer wrote since the last answer.
  const pending: string[] = [];
  for (const row of [...results].reverse()) {
    if (row.author_type !== "contact") break;
    pending.unshift(row.body);
  }

  const streamId = crypto.randomUUID();
  const status = (value: "thinking" | "done" | "failed") =>
    notifyContact(env, contact.id, { type: "assistant.status", conversationId, streamId, status: value });
  await status("thinking");
  let lastSent = 0;
  try {
    const reply = await generateReply({
      env,
      stored,
      apiKey,
      question: pending.join("\n"),
      history,
      conversationId,
      contact: {
        id: contact.id,
        externalId: contact.external_id,
        email: contact.email,
        name: contact.name,
        isIdentified: contact.is_identified === 1,
      },
      ownHost: new URL(origin || "https://invalid.local").hostname,
      onText: (text) => {
        if (Date.now() - lastSent < DELTA_EVERY_MS) return;
        lastSent = Date.now();
        ctx.waitUntil(notifyContact(env, contact.id, { type: "assistant.delta", conversationId, streamId, text }));
      },
    });
    ctx.waitUntil(recordUsage(env, reply.costUsd));
    const current = await getConversation(env, conversationId);
    // A teammate stepped in, or the customer asked for one, while it was writing.
    if (current.ai_state !== "active" || !reply.text) {
      await status("failed");
      if (current.ai_state === "active") await handOff();
      return;
    }
    const agent = await assistantAgent(env, stored);
    await postAssistantMessage(env, ctx, origin, current, agent, reply.text);
    await status("done");
  } catch (error) {
    console.error("assistant reply failed", error instanceof Error ? error.message : String(error));
    await status("failed");
    await handOff();
  } finally {
    await env.DB.prepare("UPDATE conversations SET ai_lock_until = NULL WHERE id = ?").bind(conversationId).run();
  }

  // The customer wrote again while it was answering: answer that too (once).
  const after = await getConversation(env, conversationId);
  if (after.ai_state === "active" && after.last_message_author === "contact" && (after.last_contact_message_at ?? 0) > now) {
    ctx.waitUntil(runAssistantTurn(env, ctx, origin, conversationId, ip));
  }
}


