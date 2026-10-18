import type { AssignmentConditions, AssignmentRule, AssignmentSettings, AssignStrategy, Attributes, AgentAvailability, RuleChannel } from "yunidesk";

// Automatic assignment, as pure functions: which rule a new conversation matches, and who in the
// team gets it. The database side (a compare-and-set on the team's turn) is in db/routing.ts.

/** What the rules can look at. */
export interface ConversationFacts {
  /** web, ios, android (and email once that channel exists). */
  channel: string;
  isIdentified: boolean;
  tagIds: readonly string[];
  attributes: Attributes;
  /** The customer's language when known (email), else null. */
  locale: string | null;
}

export function channelMatches(rule: RuleChannel, channel: string): boolean {
  if (rule === "any") return true;
  if (rule === "app") return channel === "ios" || channel === "android";
  return channel === rule;
}

/** Attribute values compare as trimmed text, ignoring case ("Pro" = "pro", 3 = "3", true = "true"). */
function sameText(value: unknown, expected: string): boolean {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return false;
  return String(value).trim().toLowerCase() === expected.trim().toLowerCase();
}

/** Every condition must hold; conditions left open ("any", null) always do. */
export function matchesConditions(conditions: AssignmentConditions, facts: ConversationFacts): boolean {
  if (!channelMatches(conditions.channel, facts.channel)) return false;
  if (conditions.language !== "any" && facts.locale !== conditions.language) return false;
  if (conditions.contact === "identified" && !facts.isIdentified) return false;
  if (conditions.contact === "anonymous" && facts.isIdentified) return false;
  if (conditions.tagId !== null && !facts.tagIds.includes(conditions.tagId)) return false;
  if (conditions.attribute !== null) {
    // Only plain values count, so keys like "__proto__" or "toString" never match through Object.prototype.
    if (!sameText(facts.attributes[conditions.attribute.key], conditions.attribute.value)) return false;
  }
  return true;
}

export interface RoutingTarget {
  teamId: string;
  assign: AssignStrategy;
  /** The rule that matched; null for the fallback team. */
  ruleId: string | null;
}

/** The first matching rule, in order; else the fallback team; else nothing (stays unassigned). */
export function pickTarget(
  rules: readonly AssignmentRule[],
  facts: ConversationFacts,
  fallback: AssignmentSettings["fallback"],
): RoutingTarget | null {
  for (const rule of rules) {
    if (matchesConditions(rule.conditions, facts)) return { teamId: rule.teamId, assign: rule.assign, ruleId: rule.id };
  }
  return fallback.teamId ? { teamId: fallback.teamId, assign: fallback.assign, ruleId: null } : null;
}

export interface Candidate {
  id: string;
  availability: AgentAvailability;
  /** Open conversations assigned to them now. */
  openCount: number;
  /** null = no limit. */
  maxOpen: number | null;
  /** Their role may reply (viewers can't). */
  canReply: boolean;
}

export function canTakeMore(candidate: Candidate): boolean {
  return (
    candidate.canReply && candidate.availability === "available" && (candidate.maxOpen === null || candidate.openCount < candidate.maxOpen)
  );
}

/**
 * The team in turn order (by id, which follows when people joined Yunidesk), starting with whoever
 * comes after `lastId`. Works when `lastId` has since left the team: the turn goes to the next id.
 */
export function turnOrder<T extends { id: string }>(members: readonly T[], lastId: string | null): T[] {
  const sorted = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!lastId) return sorted;
  const start = sorted.findIndex((m) => m.id > lastId);
  return start <= 0 ? sorted : [...sorted.slice(start), ...sorted.slice(0, start)];
}

/**
 * Who gets the conversation. Away teammates and those at their limit are skipped.
 * round_robin: the next one in turn. least_busy: fewest open conversations, ties to the next in turn.
 */
export function chooseAssignee(strategy: AssignStrategy, members: readonly Candidate[], lastId: string | null): string | null {
  if (strategy === "none") return null;
  const eligible = turnOrder(members, lastId).filter(canTakeMore);
  const first = eligible[0];
  if (!first) return null;
  if (strategy === "round_robin") return first.id;
  let best = first;
  for (const candidate of eligible) if (candidate.openCount < best.openCount) best = candidate;
  return best.id;
}

// ---- Applying a choice safely when conversations arrive at the same moment ----

export interface TeamTurn {
  /** Changes on every automatic assignment in the team. */
  version: string;
  lastAgentId: string | null;
  members: Candidate[];
}

export type ApplyResult = "applied" | "lost_turn" | "already_routed";

/** The storage the retry loop runs against (D1 in the worker, SQLite in tests). */
export interface TurnStore {
  readTurn(teamId: string): Promise<TeamTurn | null>;
  /**
   * In one transaction: moves the team's turn from `expectedVersion` to `nextVersion` and puts the
   * conversation in the team with `assigneeId`, only if the turn hasn't moved and the conversation
   * is still unrouted (no team, no assignee).
   */
  apply(input: {
    teamId: string;
    conversationId: string;
    assigneeId: string | null;
    expectedVersion: string;
    nextVersion: string;
  }): Promise<ApplyResult>;
}

const MAX_ATTEMPTS = 6;

/**
 * Reads the team's turn, chooses, and compare-and-sets. A writer that lost the race reads again
 * (now seeing the winner's pick and its new open count) and chooses again, so two conversations
 * arriving together never both go to the same person by round robin.
 */
export async function assignInTeam(
  store: TurnStore,
  conversationId: string,
  target: Pick<RoutingTarget, "teamId" | "assign">,
  newVersion: () => string,
): Promise<{ assigneeId: string | null } | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const turn = await store.readTurn(target.teamId);
    if (!turn) return null;
    const assigneeId = chooseAssignee(target.assign, turn.members, turn.lastAgentId);
    const result = await store.apply({
      teamId: target.teamId,
      conversationId,
      assigneeId,
      expectedVersion: turn.version,
      nextVersion: newVersion(),
    });
    if (result === "applied") return { assigneeId };
    if (result === "already_routed") return null;
  }
  return null;
}
