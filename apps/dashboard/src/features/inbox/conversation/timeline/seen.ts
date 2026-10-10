import type { TimelineMessage } from "yunidesk";

/** The team's last reply, when the contact has read it: that is where "Seen" goes. */
export function seenMessageId(messages: TimelineMessage[], contactLastReadAt: number | null): string | null {
  if (!contactLastReadAt) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.authorType === "agent" && m.kind === "text") {
      return !m.delivery && m.createdAt <= contactLastReadAt ? m.id : null;
    }
  }
  return null;
}
