import type { MessengerRoute } from "../provider/support-context";

// The messenger's own little stack. Kept pure so the back behaviour can be tested.

export type Screen =
  | { name: "home" }
  | { name: "messages" }
  | { name: "conversation"; conversationId: string | null; initialText?: string }
  | { name: "article"; articleId: string };

/** The stack a messenger opens with. Opening on a conversation keeps the list underneath for Back. */
export function initialStack(route: MessengerRoute): Screen[] {
  if (route === "home") return [{ name: "home" }];
  if (route === "messages") return [{ name: "messages" }];
  if (route === "new") return [{ name: "home" }, { name: "conversation", conversationId: null }];
  return [{ name: "messages" }, { name: "conversation", conversationId: route.conversationId }];
}

export function push(stack: Screen[], screen: Screen): Screen[] {
  return [...stack, screen];
}

/** Null when there is nothing to go back to (the messenger should close). */
export function pop(stack: Screen[]): Screen[] | null {
  return stack.length > 1 ? stack.slice(0, -1) : null;
}

/** A new conversation got its server id: remember it so going back and forth keeps it. */
export function replaceTopConversation(stack: Screen[], conversationId: string): Screen[] {
  const top = stack[stack.length - 1];
  if (top?.name !== "conversation") return stack;
  return [...stack.slice(0, -1), { name: "conversation", conversationId }];
}
