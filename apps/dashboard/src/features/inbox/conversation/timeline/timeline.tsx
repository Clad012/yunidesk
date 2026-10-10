import { useLayoutEffect, useMemo, useRef } from "react";
import { buildTimeline, type AgentConversation, type TimelineMessage } from "yunidesk";
import { copy } from "@/lib/copy";
import { dayLabel } from "@/lib/time";
import { Skeleton } from "@/components/ui/skeleton";
import { EventRow } from "./event-row";
import { MessageGroup } from "./message-group";
import { RatingCard } from "./rating-card";
import { seenMessageId } from "./seen";
import { ContactTyping } from "./typing-row";
import { useOlderOnScroll } from "./use-older-on-scroll";

interface TimelineProps {
  conversation: AgentConversation;
  messages: TimelineMessage[];
  loading: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<unknown>;
  onRetry: (message: TimelineMessage) => void;
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-14 w-2/3 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
      <Skeleton className="h-20 w-3/5 rounded-2xl" />
    </div>
  );
}

export function Timeline({ conversation, messages, loading, hasOlder, loadingOlder, loadOlder, onRetry }: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildTimeline(messages), [messages]);
  const seenId = useMemo(() => seenMessageId(messages, conversation.contactLastReadAt), [messages, conversation.contactLastReadAt]);
  const loadOlderNearTop = useOlderOnScroll(scroller, { hasOlder, loadingOlder, loadOlder, firstId: messages[0]?.id });

  // Follow the bottom when new messages arrive and the agent is already there (or sent it).
  const atBottom = useRef(true);
  const last = messages[messages.length - 1];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !last) return;
    if (atBottom.current || (last.authorType === "agent" && last.delivery === "sending")) el.scrollTop = el.scrollHeight;
  }, [last?.id, last?.clientId, last]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        loadOlderNearTop();
      }}
      className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
    >
      {loading ? (
        <TimelineSkeleton />
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-5">
          <div className="py-1 text-center text-xs text-muted-foreground">
            {hasOlder ? (loadingOlder ? copy.conversation.loadOlder : " ") : copy.conversation.beginning}
          </div>
          {items.map((item) =>
            item.type === "day" ? (
              <div key={item.key} className="my-2 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(item.at, Date.now(), { today: copy.common.today, yesterday: copy.common.yesterday })}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : item.type === "event" ? (
              <EventRow key={item.key} message={item.message} />
            ) : (
              <MessageGroup key={item.key} group={item} contact={conversation.contact} seenId={seenId} onRetry={onRetry} />
            ),
          )}
          <RatingCard conversation={conversation} />
          <ContactTyping conversationId={conversation.id} contact={conversation.contact} />
        </div>
      )}
    </div>
  );
}
