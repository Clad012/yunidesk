import { Link } from "@tanstack/react-router";
import type { AgentConversation } from "yunidesk";
import { copy } from "@/lib/copy";
import { relativeShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { previewText } from "@/features/inbox/lib/labels";
import { useBootstrap } from "@/hooks/use-bootstrap";

const STATUS_DOT = { open: "bg-primary", snoozed: "bg-amber-500", resolved: "bg-success" } as const;

export function ConversationLinkList({ conversations, empty }: { conversations: AgentConversation[]; empty: string }) {
  const { agent } = useBootstrap();
  if (conversations.length === 0) return <p className="px-2 py-2 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {conversations.map((c) => {
        const { prefix, text } = previewText(c.lastMessage, agent.name);
        return (
          <li key={c.id}>
            <Link
              to="/inbox/$view/$conversationId"
              params={{ view: "all", conversationId: c.id }}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[c.status])} title={copy.conversation[`status_${c.status}`]} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {prefix}
                <span className={cn(c.unread && "font-medium text-foreground")}>{text || "—"}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{relativeShort(c.lastMessageAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
