import type { Contact } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { typingStore } from "@/lib/realtime/live";
import { useStore } from "@/lib/realtime/store";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { contactLabel } from "../../lib/labels";

function Dots() {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}

/** "Jane is typing…" for the contact. */
export function ContactTyping({ conversationId, contact }: { conversationId: string; contact: Contact }) {
  const typing = useStore(typingStore, (s) => Boolean(s[conversationId]?.contactUntil));
  if (!typing) return null;
  return (
    <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground" role="status">
      <span className="flex h-7 items-center rounded-2xl rounded-bl-md bg-bubble-contact px-3">
        <Dots />
      </span>
      {fmt(copy.conversation.typing, { name: contactLabel(contact) })}
    </div>
  );
}

/** "Ana is replying" / "Ana is writing a note" for teammates in the same conversation, so two people don't answer at once. */
export function TeammatesReplying({ conversationId }: { conversationId: string }) {
  const agents = useStore(typingStore, (s) => s[conversationId]?.agents);
  const list = agents ? Object.values(agents) : [];
  if (list.length === 0) return null;
  const names = list.map((a) => a.agent.name);
  const label =
    list.length === 1
      ? fmt(list[0]!.internal ? copy.conversation.writingNote : copy.conversation.replying, { name: names[0]! })
      : fmt(copy.conversation.replyingMany, { names: names.join(", ") });
  return (
    <div className="flex justify-center px-4 pb-1.5" role="status">
      <AnimatedShinyText className="rounded-full bg-primary/8 px-3 py-1 text-xs font-medium">{label}</AnimatedShinyText>
    </div>
  );
}
