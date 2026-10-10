import { Store } from "./store";
import type { SocketStatus } from "./socket";
import { expireTyping, type TypingState } from "./typing";

export const statusStore = new Store<SocketStatus>("closed");
export const presenceStore = new Store<string[]>([]);
export const typingStore = new Store<TypingState>({});

// Typing indicators expire on their own when the typist stops sending refreshes.
setInterval(() => {
  const current = typingStore.get();
  if (Object.keys(current).length) typingStore.set(expireTyping(current, Date.now()));
}, 1000);
