import { Link } from "@tanstack/react-router";
import { PaperclipIcon } from "lucide-react";
import type { AgentConversation } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { relativeShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useNow } from "@/hooks/use-now";
import { PersonAvatar } from "@/components/person-avatar";
import { ChannelIcon } from "@/components/channel-icon";
import { Tip } from "@/components/ui/tooltip";
import { contactLabel, previewText } from "../lib/labels";
import { useInboxParams } from "../lib/use-inbox-params";
import { AiAnsweringChip } from "../conversation/ai-answering-chip";

export function ConversationRow({ conversation, active }: { conversation: AgentConversation; active: boolean }) {
  const { agent } = useBootstrap();
  const { view, q } = useInboxParams();
  const now = useNow(30_000);
  const { contact, lastMessage, assignee, unread } = conversation;
  const { prefix, text } = previewText(lastMessage, agent.name);

  return (
    <Link
      to="/inbox/$view/$conversationId"
      params={{ view, conversationId: conversation.id }}
      search={q ? { q } : {}}
      data-conversation-id={conversation.id}
      className={cn(
        "flex gap-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        active && "bg-primary/8 hover:bg-primary/10",
      )}
    >
      <PersonAvatar name={contactLabel(contact)} avatarUrl={contact.avatarUrl} online={contact.online} seed={contact.id} className="size-9" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{contactLabel(contact)}</span>
          <ChannelIcon channel={conversation.channel} className="size-3 shrink-0 text-muted-foreground" />
          <span className={cn("ml-auto shrink-0 text-xs tabular-nums", unread ? "font-medium text-primary" : "text-muted-foreground")}>
            {relativeShort(conversation.lastMessageAt, now)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "text-foreground" : "text-muted-foreground")}>
            {lastMessage && lastMessage.attachmentCount > 0 ? <PaperclipIcon className="mr-1 inline size-3 align-[-1px]" /> : null}
            <span className="text-muted-foreground">{prefix}</span>
            {text}
          </p>
          {conversation.aiActive ? <AiAnsweringChip className="px-1 py-0 text-[10px]" /> : null}
          {assignee ? (
            <Tip label={fmt(copy.list.assignedTo, { name: assignee.name })}>
              <span>
                <PersonAvatar name={assignee.name} avatarUrl={assignee.avatarUrl} seed={assignee.id} className="size-4 text-[8px]" />
              </span>
            </Tip>
          ) : null}
          {unread ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
        </div>
      </div>
    </Link>
  );
}
