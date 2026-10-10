import { TYPING_TTL_MS, type PublicAgent } from "yunidesk";

export interface ConversationTyping {
  contactUntil: number | null;
  agents: Record<string, { agent: PublicAgent; until: number; internal: boolean }>;
}

export type TypingState = Record<string, ConversationTyping>;

export type TypingSignal =
  | { conversationId: string; by: "contact"; isTyping: boolean }
  | { conversationId: string; by: "agent"; agent: PublicAgent; isTyping: boolean; internal?: boolean };

export function applyTyping(state: TypingState, signal: TypingSignal, now: number): TypingState {
  const current = state[signal.conversationId] ?? { contactUntil: null, agents: {} };
  const until = signal.isTyping ? now + TYPING_TTL_MS : null;
  let next: ConversationTyping;
  if (signal.by === "contact") {
    next = { ...current, contactUntil: until };
  } else {
    const agents = { ...current.agents };
    if (until) agents[signal.agent.id] = { agent: signal.agent, until, internal: signal.internal === true };
    else delete agents[signal.agent.id];
    next = { ...current, agents };
  }
  return { ...state, [signal.conversationId]: next };
}

/** Drops indicators that weren't refreshed in time. Returns the same object when nothing expired. */
export function expireTyping(state: TypingState, now: number): TypingState {
  let changed = false;
  const next: TypingState = {};
  for (const [id, entry] of Object.entries(state)) {
    const contactUntil = entry.contactUntil && entry.contactUntil > now ? entry.contactUntil : null;
    const agents = Object.fromEntries(Object.entries(entry.agents).filter(([, a]) => a.until > now));
    if (contactUntil !== entry.contactUntil || Object.keys(agents).length !== Object.keys(entry.agents).length) changed = true;
    if (contactUntil || Object.keys(agents).length) next[id] = { contactUntil, agents };
    else changed = true;
  }
  return changed ? next : state;
}
