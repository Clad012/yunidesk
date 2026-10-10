import type { Contact, TimelineItem, TimelineMessage } from "yunidesk";
import { CheckCheckIcon } from "lucide-react";
import { Fragment } from "react";
import { copy } from "@/lib/copy";
import { formatClock } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";
import { contactLabel } from "../../lib/labels";
import { MessageBubble } from "./message-bubble";

interface MessageGroupProps {
  group: Extract<TimelineItem, { type: "group" }>;
  contact: Contact;
  seenId: string | null;
  onRetry: (message: TimelineMessage) => void;
}

export function MessageGroup({ group, contact, seenId, onRetry }: MessageGroupProps) {
  const { agent: me } = useBootstrap();
  const team = group.side === "team";
  const name = team ? (group.agent?.id === me.id ? copy.common.you : (group.agent?.name ?? copy.common.unknown)) : contactLabel(contact);
  const first = group.messages[0]!;

  return (
    <div className={cn("flex gap-2.5", team && "flex-row-reverse")}>
      {team ? (
        <PersonAvatar name={group.agent?.name ?? null} avatarUrl={group.agent?.avatarUrl} seed={group.agent?.id} className="mt-5 size-7 text-[10px]" />
      ) : (
        <PersonAvatar name={contactLabel(contact)} avatarUrl={contact.avatarUrl} seed={contact.id} className="mt-5 size-7 text-[10px]" />
      )}
      <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-1", team ? "items-end" : "items-start")}>
        <span className="px-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{name}</span> · {formatClock(first.createdAt)}
        </span>
        {group.messages.map((message) => (
          <Fragment key={message.clientId ?? message.id}>
            <MessageBubble message={message} side={group.side} onRetry={onRetry} />
            {message.id === seenId ? (
              <span className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                <CheckCheckIcon className="size-3.5 text-primary" /> {copy.conversation.seen}
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
