import { DurableObject } from "cloudflare:workers";
import type { ClientEvent, ContactServerEvent } from "yunidesk";
import type { Env } from "../env";
import { notifyUnreadReplies } from "../jobs/unread";
import { inboxHub } from "../lib/realtime";

/** How long a reply may stay unread before we tell the host app (push) or email the visitor. */
const UNREAD_NOTIFY_DELAY_MS = 2 * 60 * 1000;

/**
 * One per contact: every tab and device of that contact holds a socket here, so a reply
 * shows up everywhere at once and the unread badge stays in sync.
 */
export class ContactChannel extends DurableObject<Env> {
  private ownedConversations = new Set<string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  override async fetch(request: Request): Promise<Response> {
    const contactId = request.headers.get("x-contact-id");
    if (request.headers.get("upgrade") !== "websocket" || !contactId) {
      return new Response("Expected websocket", { status: 426 });
    }
    await this.ctx.storage.put("contactId", contactId);

    const wasOffline = this.openSockets().length === 0;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "ready" } satisfies ContactServerEvent));

    const hub = inboxHub(this.env);
    if (wasOffline) await hub.setContactOnline(contactId, true);
    const onlineAgents = await hub.onlineAgentIds();
    server.send(JSON.stringify({ type: "presence", online: onlineAgents.length > 0 } satisfies ContactServerEvent));
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(event: ContactServerEvent): Promise<void> {
    const data = JSON.stringify(event);
    for (const ws of this.openSockets()) {
      try {
        ws.send(data);
      } catch {
        // closing socket
      }
    }
  }

  async scheduleUnreadCheck(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + UNREAD_NOTIFY_DELAY_MS);
    }
  }

  override async alarm(): Promise<void> {
    const contactId = await this.ctx.storage.get<string>("contactId");
    if (contactId) await notifyUnreadReplies(this.env, contactId);
  }

  /** Used when a contact is erased. */
  async disconnectAll(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4001, "Contact deleted");
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  override async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 2000) return;
    let event: ClientEvent;
    try {
      event = JSON.parse(message) as ClientEvent;
    } catch {
      return;
    }
    if (event.type !== "typing" || typeof event.conversationId !== "string") return;
    if (!(await this.owns(event.conversationId))) return;
    await inboxHub(this.env).contactTyping(event.conversationId, Boolean(event.isTyping));
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // already closed
    }
    await this.markOfflineIfLast(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.markOfflineIfLast(ws);
  }

  private async markOfflineIfLast(closing: WebSocket): Promise<void> {
    if (this.openSockets().some((ws) => ws !== closing)) return;
    const contactId = await this.ctx.storage.get<string>("contactId");
    if (contactId) await inboxHub(this.env).setContactOnline(contactId, false);
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1);
  }

  private async owns(conversationId: string): Promise<boolean> {
    if (this.ownedConversations.has(conversationId)) return true;
    const contactId = await this.ctx.storage.get<string>("contactId");
    const row = await this.env.DB.prepare("SELECT 1 AS ok FROM conversations WHERE id = ? AND contact_id = ?")
      .bind(conversationId, contactId ?? "")
      .first<{ ok: number }>();
    if (row) this.ownedConversations.add(conversationId);
    return Boolean(row);
  }
}
