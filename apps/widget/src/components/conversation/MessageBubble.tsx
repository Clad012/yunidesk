import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { formatClock, type Attachment, type TimelineMessage } from "yunidesk";
import { useMessenger } from "../../state/context";
import { MessageAttachments } from "./MessageAttachments";
import { MessageText } from "./MessageText";
import { cn } from "../../lib/cn";

export type BubblePosition = "single" | "first" | "middle" | "last";

const CORNERS: Record<"contact" | "team", Record<BubblePosition, string>> = {
  contact: { single: "", first: "rounded-br-md", middle: "rounded-r-md", last: "rounded-tr-md" },
  team: { single: "", first: "rounded-bl-md", middle: "rounded-l-md", last: "rounded-tl-md" },
};

interface Props {
  message: TimelineMessage;
  side: "contact" | "team";
  position: BubblePosition;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

/** One message: attachments, then the text bubble. Time shows on hover, or on tap. */
export function MessageBubble({ message, side, position, onRetry, onOpenImage }: Props) {
  const { strings, locale } = useMessenger();
  const [showTime, setShowTime] = useState(false);
  const failed = message.delivery === "failed";
  const mine = side === "contact";
  const time = (
    <time
      dateTime={new Date(message.createdAt).toISOString()}
      className={cn(
        "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap text-faint tabular-nums transition-opacity duration-150",
        mine ? "right-full mr-2" : "left-full ml-2",
        showTime ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100",
      )}
    >
      {formatClock(message.createdAt, locale)}
    </time>
  );

  return (
    <div className={cn("group/msg flex w-full", mine ? "justify-end" : "justify-start")}>
      <div className={cn("relative flex min-w-0 max-w-full flex-col gap-1", mine ? "items-end" : "items-start")}>
        {time}
        <MessageAttachments attachments={message.attachments} side={side} onOpenImage={onOpenImage} />
        {message.body && (
          <div
            role={failed ? "button" : undefined}
            tabIndex={failed ? 0 : undefined}
            aria-label={failed ? `${strings.sendFailed} ${message.body}` : undefined}
            onClick={() => (failed ? onRetry(message) : setShowTime((v) => !v))}
            onKeyDown={(e) => failed && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRetry(message))}
            className={cn(
              "max-w-full rounded-[20px] px-3.5 py-2 text-[15px] leading-[1.4] break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
              mine ? "bg-brand text-on-brand selection:bg-on-brand/30" : "bg-soft text-fg",
              CORNERS[side][position],
              message.delivery === "sending" && "opacity-75",
              failed && "cursor-pointer opacity-60 ring-2 ring-danger/60",
            )}
          >
            <MessageText body={message.body} />
          </div>
        )}
        {failed && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="flex cursor-pointer items-center gap-1 text-xs font-medium text-danger hover:underline"
          >
            <AlertCircle className="size-3.5" aria-hidden="true" />
            {strings.sendFailed}
          </button>
        )}
      </div>
    </div>
  );
}
