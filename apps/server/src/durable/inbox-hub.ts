import { DurableObject } from "cloudflare:workers";
import type { AgentServerEvent, ClientEvent, PublicAgent } from "yunidesk";
import type { Env } from "../env";
import { contactChannel } from "../lib/realtime";

interface SocketInfo {
  agent: PublicAgent;
  /** The tab reports whether it is on screen; until it does, it counts as visible. */
  visible?: boolean;
  /** False for viewers (read-only roles): their typing frames are ignored. Absent on older sockets. */
  canType?: boolean;
}

const ONLINE_PREFIX = "online:";

/**
 * The team's live room: every open dashboard tab holds one hibernatable socket here.
 * It fans out conversation events, agent presence, and typing in both directions.
 * Which contacts are online is kept in storage so it survives hibernation.
 */
export class InboxHub extends DurableObject<Env> {
  private conversationContacts = new Map<string, string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  override async fetch(request: Request): Promise<Response> {
    const raw = request.headers.get("x-agent");
    const session = request.headers.get("x-agent-session");
    if (request.headers.get("upgrade") !== "websocket" || !raw || !session) {
      return new Response("Expected websocket", { status: 426 });
    }
    const agent = JSON.parse(decodeURIComponent(raw)) as PublicAgent;

    const { 0: client, 1: server } = new WebSocketPair();
    // Tagged by agent and by session, so a logout, a disabled account or a password change can cut them.
    this.ctx.acceptWebSocket(server, [agent.id, `session:${session}`]);
    server.serializeAttachment({ agent, canType: request.headers.get("x-agent-can-type") !== "0" } satisfies SocketInfo);

    const onlineAgentIds = this.onlineAgentIds();
    server.send(JSON.stringify({ type: "ready", onlineAgentIds } satisfies AgentServerEvent));
    this.send({ type: "presence", onlineAgentIds }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Closes every socket of this agent (account disabled, password changed). */
  async disconnectAgent(agentId: string): Promise<void> {
    this.closeTagged(agentId);
  }

  /** Closes the sockets opened with one session (logout). */
  async disconnectSession(sessionHash: string): Promise<void> {
    this.closeTagged(`session:${sessionHash}`);
  }

  private closeTagged(tag: string): void {
    const closing = this.ctx.getWebSockets(tag);
    for (const ws of closing) {
      try {
        ws.close(4401, "Signed out");
      } catch {
        // already closed
      }
    }
    if (closing.length) this.send({ type: "presence", onlineAgentIds: this.onlineAgentIds() });
  }

  async broadcast(event: AgentServerEvent): Promise<void> {
    if ((event.type === "message.created" || event.type === "conversation.updated") && event.conversation) {
      const online = await this.ctx.storage.get<boolean>(ONLINE_PREFIX + event.conversation.contact.id);
      event.conversation.contact.online = Boolean(online);
    }
    this.send(event);
  }

  onlineAgentIds(exclude?: WebSocket): string[] {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || ws.readyState !== 1) continue;
      const info = ws.deserializeAttachment() as SocketInfo | null;
      if (info) ids.add(info.agent.id);
    }
    return [...ids];
  }

  /** Teammates with a dashboard tab open and on screen: push notifications skip them. */
  async visibleAgentIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const info = ws.deserializeAttachment() as SocketInfo | null;
      if (info && info.visible !== false) ids.add(info.agent.id);
    }
    return [...ids];
  }

  async setContactOnline(contactId: string, online: boolean): Promise<void> {
    if (online) await this.ctx.storage.put(ONLINE_PREFIX + contactId, true);
    else await this.ctx.storage.delete(ONLINE_PREFIX + contactId);
    this.send({ type: "contact.presence", contactId, online });
  }

  async onlineContacts(contactIds: string[]): Promise<string[]> {
    const online: string[] = [];
    for (let i = 0; i < contactIds.length; i += 128) {
      const keys = contactIds.slice(i, i + 128).map((id) => ONLINE_PREFIX + id);
      const found = await this.ctx.storage.get<boolean>(keys);
      for (const [key, value] of found) if (value) online.push(key.slice(ONLINE_PREFIX.length));
    }
    return online;
  }

  async contactTyping(conversationId: string, isTyping: boolean): Promise<void> {
    this.send({ type: "typing", conversationId, by: "contact", isTyping });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 2000) return;
    let event: ClientEvent;
    try {
      event = JSON.parse(message) as ClientEvent;
    } catch {
      return;
    }
    const info = ws.deserializeAttachment() as SocketInfo | null;
    if (!info) return;
    if (event.type === "visibility") {
      ws.serializeAttachment({ ...info, visible: event.visible === true } satisfies SocketInfo);
      return;
    }
    if (info.canType === false) return;
    if (event.type !== "typing" || typeof event.conversationId !== "string") return;
    const isTyping = Boolean(event.isTyping);

    // Teammates see who is replying, so two people don't answer at once.
    const internal = event.internal === true;
    this.send(
      { type: "typing", conversationId: event.conversationId, by: "agent", agent: info.agent, isTyping, internal },
      ws,
    );
    if (internal) return; // a note in progress stays inside the team

    const contactId = await this.contactFor(event.conversationId);
    if (contactId) {
      await contactChannel(this.env, contactId).broadcast({
        type: "typing",
        conversationId: event.conversationId,
        agent: info.agent,
        isTyping,
      });
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // already closed
    }
    this.send({ type: "presence", onlineAgentIds: this.onlineAgentIds(ws) }, ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.send({ type: "presence", onlineAgentIds: this.onlineAgentIds(ws) }, ws);
  }

  private async contactFor(conversationId: string): Promise<string | null> {
    const cached = this.conversationContacts.get(conversationId);
    if (cached) return cached;
    const row = await this.env.DB.prepare("SELECT contact_id FROM conversations WHERE id = ?")
      .bind(conversationId)
      .first<{ contact_id: string }>();
    if (row) this.conversationContacts.set(conversationId, row.contact_id);
    return row?.contact_id ?? null;
  }

  private send(event: AgentServerEvent, except?: WebSocket): void {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        // closing socket
      }
    }
  }
}
