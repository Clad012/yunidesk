import type { Env } from "../env";
import { assignInTeam, pickTarget, type ConversationFacts, type TurnStore } from "../lib/assignment";
import { APPLY_ROUTE_SQL, CLAIM_TURN_SQL, TEAM_CANDIDATES_SQL, toCandidate, type CandidateRow } from "./assignment-sql";
import { announceRouting, getConversation, handOffToTeam } from "./conversations";
import type { ContactRow, ConversationRow, TeamRow } from "./rows";
import { loadAssignment } from "./teams";

/** The team's turn in D1: reads, then a two-statement batch (one transaction) that compare-and-sets. */
export function d1TurnStore(env: Env): TurnStore {
  return {
    async readTurn(teamId) {
      const team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first<TeamRow>();
      if (!team) return null;
      const { results } = await env.DB.prepare(TEAM_CANDIDATES_SQL).bind(teamId).all<CandidateRow>();
      return {
        version: team.assign_version,
        lastAgentId: team.last_assigned_agent_id,
        members: results.map(toCandidate),
      };
    },
    async apply({ teamId, conversationId, assigneeId, expectedVersion, nextVersion }) {
      const [, routed] = await env.DB.batch([
        env.DB.prepare(CLAIM_TURN_SQL).bind(nextVersion, assigneeId, teamId, expectedVersion, conversationId),
        env.DB.prepare(APPLY_ROUTE_SQL).bind(teamId, assigneeId, Date.now(), conversationId, teamId, nextVersion),
      ]);
      if (routed?.meta.changes) return "applied";
      const row = await env.DB.prepare("SELECT team_id, assignee_id FROM conversations WHERE id = ?")
        .bind(conversationId)
        .first<Pick<ConversationRow, "team_id" | "assignee_id">>();
      return !row || row.team_id !== null || row.assignee_id !== null ? "already_routed" : "lost_turn";
    },
  };
}

async function conversationFacts(env: Env, conversation: ConversationRow): Promise<ConversationFacts> {
  const [contact, tags, email] = await env.DB.batch([
    env.DB.prepare("SELECT is_identified, attributes FROM contacts WHERE id = ?").bind(conversation.contact_id),
    env.DB.prepare("SELECT tag_id FROM conversation_tags WHERE conversation_id = ?").bind(conversation.id),
    // The language detected on the first inbound email (other channels don't know it).
    env.DB.prepare(
      `SELECT e.locale FROM email_originals e JOIN messages m ON m.id = e.message_id
       WHERE m.conversation_id = ? ORDER BY m.created_at LIMIT 1`,
    ).bind(conversation.id),
  ]);
  const row = contact?.results[0] as Pick<ContactRow, "is_identified" | "attributes"> | undefined;
  let attributes: ConversationFacts["attributes"] = {};
  try {
    const parsed = JSON.parse(row?.attributes ?? "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) attributes = parsed as ConversationFacts["attributes"];
  } catch {
    // Unreadable attributes simply match no attribute condition.
  }
  return {
    channel: conversation.channel,
    isIdentified: row?.is_identified === 1,
    tagIds: (tags?.results as { tag_id: string }[] | undefined)?.map((t) => t.tag_id) ?? [],
    attributes,
    locale: (email?.results[0] as { locale: string | null } | undefined)?.locale ?? null,
  };
}

/**
 * Runs the assignment rules on a conversation that is going to people: a new one the AI assistant
 * isn't answering, or one it just handed off. Does nothing to a conversation that already has an
 * assignee or a team (a person chose), that the assistant is answering, or that is resolved.
 */
export async function routeConversation(env: Env, ctx: ExecutionContext, origin: string, conversationId: string): Promise<void> {
  try {
    const conversation = await getConversation(env, conversationId);
    if (conversation.assignee_id || conversation.team_id || conversation.ai_state === "active" || conversation.status === "resolved") return;
    const config = await loadAssignment(env);
    if (config.rules.length === 0 && !config.fallback.teamId) return;
    const target = pickTarget(config.rules, await conversationFacts(env, conversation), config.fallback);
    if (!target) return;
    const team = await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(target.teamId).first<{ name: string }>();
    if (!team) return;
    const result = await assignInTeam(d1TurnStore(env), conversationId, target, () => crypto.randomUUID());
    if (!result) return;
    await announceRouting(env, ctx, origin, conversationId, team, result.assigneeId);
  } catch (error) {
    // Routing is a convenience: the conversation is already in the inbox, unassigned.
    console.error("assignment rules failed", error instanceof Error ? error.message : String(error));
  }
}

/** The assistant stops ("Talk to a human", a limit, an error) and the rules route the conversation. */
export async function handOffAndRoute(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
): Promise<ConversationRow> {
  const handedOff = await handOffToTeam(env, ctx, origin, conversation);
  if (handedOff.ai_state !== "handed_off") return handedOff;
  await routeConversation(env, ctx, origin, conversation.id);
  return getConversation(env, conversation.id);
}
