import { runAssistantTurn } from "../lib/assistant/engine";
import { getAssistant, isAssistantReady } from "../lib/assistant/settings";
import { Hono } from "hono";
import { z } from "zod";
import { verifyUserToken } from "yunidesk/identity";
import type { BootstrapResponse, Channel, SessionResponse, WidgetConfig } from "yunidesk";
import { clientIp, limit, publicOrigin, readBody, type AppContext, type AppEnv } from "../app-env";
import {
  CONTACT_VISIBLE_SQL,
  createConversation,
  getConversation,
  markRead,
  postMessage,
  rateConversation,
  handOffToTeam,
} from "../db/conversations";
import type { AgentRow, ContactRow, ConversationRow, MessageRow } from "../db/rows";
import { toAttachment, toContactConversations, toContactProfile, toMessages, toPublicAgent } from "../db/serialize";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { newId } from "../lib/ids";
import { contactChannel, inboxHub } from "../lib/realtime";
import { getSettings, toWidgetSettings } from "../lib/settings";
import { issueContactToken, verifyContactToken, verifyEmailVerifyToken } from "../lib/tokens";
import { emailConfigured, sendEmailConfirmation } from "../lib/email";
import { envList } from "../env";
import { storeUpload } from "../lib/uploads";

const channelSchema = z.enum(["web", "ios", "android"]);
const sessionSchema = z.object({
  userToken: z.string().max(8000).nullish(),
  visitorToken: z.string().max(2000).nullish(),
  channel: channelSchema.default("web"),
});
const draftSchema = z.object({
  body: z.string().max(5000).default(""),
  attachmentIds: z.array(z.string().max(64)).max(5).default([]),
  clientId: z.string().min(8).max(64),
});
const ratingSchema = z.object({
  score: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  comment: z.string().trim().max(1000).optional(),
});
const contactPatchSchema = z.object({
  email: z.email().max(254).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

const PAGE_SIZE = 50;

/** Avatars from identity tokens end up in <img src> in the dashboard: https only. */
function httpsUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

export const contactRoutes = new Hono<AppEnv>();

/** The only contact endpoints that run without a session (they authenticate themselves). */
const PUBLIC_PATHS = new Set(["/api/v1/session", "/api/v1/ws", "/api/v1/verify-email"]);

// ---- Session: the one unauthenticated endpoint ----

contactRoutes.post("/session", async (c) => {
  await limit(c.env.WRITE_LIMITER, `session:${clientIp(c)}`);
  const input = await readBody(c, sessionSchema);
  const now = Date.now();
  let contact: ContactRow | null = null;

  if (input.userToken) {
    const identity = await verifyUserToken(input.userToken, c.env.IDENTITY_SECRET, Date.now(), {
      maxLifetimeSeconds: 24 * 3600,
      extraAudiences: envList(c.env.IDENTITY_AUDIENCES),
    });
    if (!identity) throw unauthorized("The user token is invalid or expired");
    contact = await c.env.DB.prepare(
      `INSERT INTO contacts (id, external_id, email, email_verified_at, name, avatar_url, attributes, is_identified, last_channel, created_at, last_seen_at)
       VALUES (?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE ? END, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         email = excluded.email, email_verified_at = excluded.email_verified_at, name = excluded.name,
         avatar_url = excluded.avatar_url, attributes = excluded.attributes, is_identified = 1,
         last_channel = excluded.last_channel, last_seen_at = excluded.last_seen_at
       RETURNING *`,
    )
      .bind(
        newId("ctc"),
        identity.userId,
        identity.email ?? null,
        // The host app vouches for its users' emails.
        identity.email ?? null,
        now,
        identity.name ?? null,
        httpsUrlOrNull(identity.avatarUrl),
        JSON.stringify(identity.attributes ?? {}),
        input.channel,
        now,
        now,
      )
      .first<ContactRow>();
  } else {
    if (input.visitorToken) {
      const claims = await verifyContactToken(c.env.SESSION_SECRET, "visitor", input.visitorToken, envList(c.env.LEGACY_TOKEN_ISSUERS));
      if (claims) {
        contact = await c.env.DB.prepare(
          "UPDATE contacts SET last_seen_at = ?, last_channel = ? WHERE id = ? AND is_identified = 0 RETURNING *",
        )
          .bind(now, input.channel, claims.contactId)
          .first<ContactRow>();
      }
    }
    if (!contact) {
      const settings = await getSettings(c.env);
      if (!settings.allowAnonymous) throw forbidden("Sign in to chat with us");
      contact = await c.env.DB.prepare(
        `INSERT INTO contacts (id, is_identified, last_channel, created_at, last_seen_at)
         VALUES (?, 0, ?, ?, ?) RETURNING *`,
      )
        .bind(newId("ctc"), input.channel, now, now)
        .first<ContactRow>();
    }
  }
  if (!contact) throw new Error("Contact upsert returned nothing");

  const identified = contact.is_identified === 1;
  const session = await issueContactToken(c.env.SESSION_SECRET, "session", { contactId: contact.id, identified });
  const visitor = identified
    ? null
    : await issueContactToken(c.env.SESSION_SECRET, "visitor", { contactId: contact.id, identified });
  return c.json<SessionResponse>({
    token: session.token,
    expiresAt: session.expiresAt,
    contact: toContactProfile(contact),
    visitorToken: visitor?.token ?? null,
  });
});

// ---- Everything below needs a contact session ----

contactRoutes.use("*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next();
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? await verifyContactToken(c.env.SESSION_SECRET, "session", token, envList(c.env.LEGACY_TOKEN_ISSUERS)) : null;
  if (!claims) throw unauthorized("Session expired");
  const contact = await c.env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(claims.contactId).first<ContactRow>();
  if (!contact) throw unauthorized("Session expired");
  c.set("contact", contact);
  c.set("identified", claims.identified);
  if (!contact.last_seen_at || Date.now() - contact.last_seen_at > 5 * 60_000) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE contacts SET last_seen_at = ? WHERE id = ?").bind(Date.now(), contact.id).run(),
    );
  }
  return next();
});

async function ownConversation(c: AppContext): Promise<ConversationRow> {
  const conversation = await getConversation(c.env, c.req.param("id")!);
  if (conversation.contact_id !== c.get("contact").id) throw notFound("Conversation not found");
  return conversation;
}

async function widgetConfig(c: AppContext): Promise<WidgetConfig> {
  const settings = await getSettings(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM agents WHERE disabled_at IS NULL AND kind = 'human'
     ORDER BY (avatar_url IS NOT NULL) DESC, last_seen_at DESC LIMIT 3`,
  ).all<AgentRow>();
  let online = false;
  try {
    online = (await inboxHub(c.env).onlineAgentIds()).length > 0;
  } catch (error) {
    console.warn("presence lookup failed", error);
  }
  const widget = toWidgetSettings(settings);
  // Only offer email follow-up when the server can actually send (and confirm) emails.
  widget.askEmailForAnonymous = widget.askEmailForAnonymous && emailConfigured(c.env);
  const assistant = await getAssistant(c.env);
  const answersThisVisitor = isAssistantReady(assistant) && (c.get("identified") || assistant.allowAnonymous);
  return { ...widget, agents: results.map(toPublicAgent), online, assistant: answersThisVisitor ? { name: assistant.name } : null };
}

async function listContactConversations(c: AppContext) {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM conversations WHERE contact_id = ? ORDER BY last_message_at DESC LIMIT 50",
  )
    .bind(c.get("contact").id)
    .all<ConversationRow>();
  return toContactConversations(c.env, results);
}

function channelOf(c: AppContext): Channel {
  return c.get("contact").last_channel ?? "web";
}

contactRoutes.get("/bootstrap", async (c) => {
  const [config, conversations] = await Promise.all([widgetConfig(c), listContactConversations(c)]);
  return c.json<BootstrapResponse>({ contact: toContactProfile(c.get("contact")), config, conversations });
});

contactRoutes.get("/conversations", async (c) => c.json({ items: await listContactConversations(c) }));

contactRoutes.get("/conversations/:id", async (c) => {
  const [conversation] = await toContactConversations(c.env, [await ownConversation(c)]);
  return c.json(conversation);
});

contactRoutes.post("/conversations", async (c) => {
  const contact = c.get("contact");
  await limit(c.env.WRITE_LIMITER, `contact:${contact.id}`);
  const draft = await readBody(c, draftSchema);
  const result = await createConversation(c.env, c.executionCtx as ExecutionContext, publicOrigin(c), contact.id, channelOf(c), draft);
  c.executionCtx.waitUntil(
    runAssistantTurn(c.env, c.executionCtx as ExecutionContext, publicOrigin(c), result.conversation.id, clientIp(c)),
  );
  const [conversation] = await toContactConversations(c.env, [result.conversation]);
  return c.json({ conversation, message: result.message }, 201);
});

contactRoutes.get("/conversations/:id/messages", async (c) => {
  const conversation = await ownConversation(c);
  const before = c.req.query("before");
  let cursor: MessageRow | null = null;
  if (before) {
    cursor = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ? AND conversation_id = ?")
      .bind(before, conversation.id)
      .first<MessageRow>();
    if (!cursor) throw badRequest("Unknown cursor");
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM messages WHERE conversation_id = ? AND ${CONTACT_VISIBLE_SQL}
       ${cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(conversation.id, ...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []), PAGE_SIZE + 1)
    .all<MessageRow>();
  const hasMore = results.length > PAGE_SIZE;
  const page = results.slice(0, PAGE_SIZE).reverse();
  return c.json({
    items: await toMessages(c.env, publicOrigin(c), page),
    nextCursor: hasMore ? (page[0]?.id ?? null) : null,
  });
});

contactRoutes.post("/conversations/:id/messages", async (c) => {
  const contact = c.get("contact");
  await limit(c.env.WRITE_LIMITER, `contact:${contact.id}`);
  const conversation = await ownConversation(c);
  const draft = await readBody(c, draftSchema);
  const result = await postMessage(
    c.env,
    c.executionCtx as ExecutionContext,
    publicOrigin(c),
    conversation,
    { type: "contact", contactId: contact.id },
    "text",
    draft,
  );
  c.executionCtx.waitUntil(
    runAssistantTurn(c.env, c.executionCtx as ExecutionContext, publicOrigin(c), conversation.id, clientIp(c)),
  );
  const [updated] = await toContactConversations(c.env, [result.conversation]);
  return c.json({ conversation: updated, message: result.message }, 201);
});

/** "Talk to a human": the AI assistant stops answering, the team takes it from here. */
contactRoutes.post("/conversations/:id/handoff", async (c) => {
  const contact = c.get("contact");
  await limit(c.env.WRITE_LIMITER, `contact:${contact.id}`);
  const updated = await handOffToTeam(c.env, c.executionCtx as ExecutionContext, publicOrigin(c), await ownConversation(c));
  const [conversation] = await toContactConversations(c.env, [updated]);
  return c.json(conversation);
});

contactRoutes.post("/conversations/:id/read", async (c) => {
  const at = await markRead(c.env, await ownConversation(c), "contact");
  return c.json({ at });
});

contactRoutes.post("/conversations/:id/rating", async (c) => {
  const conversation = await ownConversation(c);
  const input = await readBody(c, ratingSchema);
  const updated = await rateConversation(
    c.env,
    c.executionCtx as ExecutionContext,
    conversation,
    input.score,
    input.comment || null,
  );
  const [result] = await toContactConversations(c.env, [updated]);
  return c.json(result);
});

contactRoutes.patch("/contact", async (c) => {
  const contact = c.get("contact");
  if (contact.is_identified) throw forbidden("Your details come from your account");
  const input = await readBody(c, contactPatchSchema);
  const email = input.email?.toLowerCase() ?? null;
  const emailChanged = email !== null && email !== contact.email;
  const updated = await c.env.DB.prepare(
    `UPDATE contacts SET email = COALESCE(?, email), name = COALESCE(?, name),
       email_verified_at = CASE WHEN ? THEN NULL ELSE email_verified_at END
     WHERE id = ? RETURNING *`,
  )
    .bind(email, input.name ?? null, emailChanged ? 1 : 0, contact.id)
    .first<ContactRow>();
  // A typed address gets a confirmation link; nothing else is ever sent to it until it's confirmed.
  if (emailChanged && email && emailConfigured(c.env)) {
    await limit(c.env.AUTH_LIMITER, `verify:${clientIp(c)}`);
    await limit(c.env.AUTH_LIMITER, `verify:${contact.id}`);
    c.executionCtx.waitUntil(sendEmailConfirmation(c.env, publicOrigin(c), contact.id, email));
  }
  return c.json(toContactProfile(updated!));
});

/** Target of the confirmation link in the email. Plain HTML, no scripts. */
contactRoutes.get("/verify-email", async (c) => {
  const claims = await verifyEmailVerifyToken(c.env.SESSION_SECRET, c.req.query("token") ?? "");
  let confirmed = false;
  if (claims) {
    const result = await c.env.DB.prepare(
      "UPDATE contacts SET email_verified_at = ? WHERE id = ? AND email = ? AND is_identified = 0",
    )
      .bind(Date.now(), claims.contactId, claims.email)
      .run();
    confirmed = (result.meta.changes ?? 0) > 0;
  }
  const message = confirmed
    ? "Your email is confirmed. We'll let you know when we reply. / Votre e-mail est confirmé."
    : "This link is invalid or has expired. / Ce lien est invalide ou a expiré.";
  return c.html(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Email</title><body style="font:16px system-ui;padding:48px 24px;max-width:480px;margin:auto">${message}</body>`,
    confirmed ? 200 : 400,
    { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" },
  );
});

contactRoutes.post("/attachments", async (c) => {
  const contact = c.get("contact");
  await limit(c.env.WRITE_LIMITER, `upload:${contact.id}`);
  await limit(c.env.WRITE_LIMITER, `upload-ip:${clientIp(c)}`);
  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM attachments WHERE uploader_type = 'contact' AND uploader_id = ? AND message_id IS NULL",
  )
    .bind(contact.id)
    .first<{ n: number; bytes: number }>();
  if ((pending?.n ?? 0) >= 20 || (pending?.bytes ?? 0) >= 50 * 1024 * 1024) {
    throw badRequest("Send the files you already attached first", "too_many_pending");
  }
  const row = await storeUpload(c.env, await c.req.formData(), { type: "contact", id: contact.id });
  return c.json(await toAttachment(c.env, publicOrigin(c), row), 201);
});

contactRoutes.post("/ws-ticket", async (c) => {
  const contact = c.get("contact");
  const { token } = await issueContactToken(c.env.SESSION_SECRET, "ws", {
    contactId: contact.id,
    identified: c.get("identified"),
  });
  return c.json({ ticket: token });
});

contactRoutes.get("/ws", async (c) => {
  if (c.req.header("upgrade") !== "websocket") return c.text("Expected websocket", 426);
  const claims = await verifyContactToken(c.env.SESSION_SECRET, "ws", c.req.query("ticket") ?? "");
  if (!claims) throw unauthorized("Invalid ticket");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-contact-id", claims.contactId);
  return contactChannel(c.env, claims.contactId).fetch(new Request(c.req.raw.url, { headers }));
});
