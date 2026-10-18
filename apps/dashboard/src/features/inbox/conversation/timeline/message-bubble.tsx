import { AlertCircleIcon, LockIcon } from "lucide-react";
import type { TimelineMessage } from "yunidesk";
import { copy } from "@/lib/copy";
import { formatClock, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { EmailMessageMeta } from "../email/email-message-meta";
import { Attachments } from "./attachments";
import { MessageBody } from "./message-body";

interface MessageBubbleProps {
  message: TimelineMessage;
  side: "contact" | "team";
  onRetry: (message: TimelineMessage) => void;
}

export function MessageBubble({ message, side, onRetry }: MessageBubbleProps) {
  const note = message.kind === "note";
  const align = side === "team" ? "end" : "start";
  return (
    <div data-message-id={message.id} className={cn("group flex flex-col gap-1", side === "team" ? "items-end" : "items-start", message.delivery === "sending" && "opacity-70")}>
      {message.body ? (
        <Tip label={formatDateTime(message.createdAt)} side={side === "team" ? "left" : "right"}>
          <div
            className={cn(
              "max-w-[min(34rem,100%)] rounded-2xl px-3.5 py-2",
              side === "contact" && "rounded-bl-md bg-bubble-contact text-foreground",
              side === "team" && !note && "rounded-br-md bg-primary text-primary-foreground",
              note && "rounded-br-md border border-note-border bg-note text-note-foreground",
            )}
          >
            {note ? (
              <span className="mb-0.5 flex items-center gap-1 text-[11px] font-medium opacity-80">
                <LockIcon className="size-3" /> {copy.conversation.internalNote}
              </span>
            ) : null}
            <MessageBody text={message.body} />
          </div>
        </Tip>
      ) : note && message.attachments.length ? (
        <span className="flex items-center gap-1 text-[11px] font-medium text-note-foreground">
          <LockIcon className="size-3" /> {copy.conversation.internalNote}
        </span>
      ) : null}
      <Attachments attachments={message.attachments} align={align} />
      {message.delivery ? null : <EmailMessageMeta message={message} />}
      {message.delivery === "failed" ? (
        <button type="button" onClick={() => onRetry(message)} className="flex items-center gap-1 text-xs text-destructive hover:underline">
          <AlertCircleIcon className="size-3.5" /> {copy.conversation.failed} · {copy.common.retry}
        </button>
      ) : message.delivery === "sending" ? (
        <span className="text-[11px] text-muted-foreground">{copy.conversation.sending}</span>
      ) : (
        <span className="hidden text-[11px] text-muted-foreground group-hover:block">{formatClock(message.createdAt)}</span>
      )}
    </div>
  );
}
