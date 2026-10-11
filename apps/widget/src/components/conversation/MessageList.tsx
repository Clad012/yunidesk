import { Fragment, useEffect, useMemo, useRef } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { buildTimeline, format, lastSeenMessageId, type Attachment, type ContactConversation, type Thread, type TimelineMessage } from "yunidesk";
import { useMessenger } from "../../state/context";
import { isTempId } from "../../state/useActions";
import { useStickyScroll } from "../../hooks/useStickyScroll";
import { ErrorState, Skeleton } from "../common/States";
import { assistantLabel } from "../../lib/preview";
import { AssistantDraftBubble } from "./AssistantDraftBubble";
import { EmailCard } from "./EmailCard";
import { MessageGroup } from "./MessageGroup";
import { RatingCard } from "./RatingCard";
import { ConversationIntro, DaySeparator, EventMarker, StatusMarker, TypingIndicator } from "./TimelineMarkers";

interface Props {
  conversationId: string | null;
  conversation: ContactConversation | null;
  thread: Thread | undefined;
  loadError: boolean;
  onReload: () => void;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

export function MessageList({ conversationId, conversation, thread, loadError, onReload, onRetry, onOpenImage }: Props) {
  const { strings, data, actions, announce } = useMessenger();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const items = useMemo(() => buildTimeline(messages), [messages]);
  const seenId = lastSeenMessageId(messages, conversation?.agentLastReadAt ?? null);
  const realId = conversationId && !isTempId(conversationId) ? conversationId : null;
  const typing = conversationId ? data.state.typing[conversationId] : undefined;
  const draft = realId ? data.state.assistantDrafts[realId] : undefined;
  const handoffConversationId = realId && conversation?.aiActive ? realId : null;
  const last = messages[messages.length - 1];
  const lastKey = last ? (last.clientId ?? last.id) : null;
  const resolved = conversation?.status === "resolved";
  // The server's own "resolved" event is the marker; draw one only when the thread has none.
  const lastEvent = useMemo(() => [...messages].reverse().find((m) => m.kind === "event"), [messages]);
  const { config, contact } = data;
  const askEmail = Boolean(config?.askEmailForAnonymous && contact && !contact.isIdentified) && messages.some((m) => m.authorType === "contact" && !m.delivery);
  const emailAfter = askEmail ? items.find((i) => i.type === "group" && i.side === "contact")?.key : undefined;

  // The group holding the assistant's final message replaces its live draft in place: no rise
  // animation, or the text would vanish and fade back in. Remembered so it never replays.
  const steadyGroups = useRef(new Set<string>());
  const draftShown = useRef(false);
  if (draftShown.current && !draft && last?.ai) {
    const group = items.findLast((item) => item.type === "group");
    if (group) steadyGroups.current.add(group.key);
  }
  draftShown.current = Boolean(draft);

  const scroll = useStickyScroll(scrollRef, contentRef, {
    contentKey: [messages.length, lastKey, last?.delivery, typing ? 1 : 0, draft?.status, draft?.text.length, conversation?.aiActive, conversation?.status, conversation?.rating?.score, seenId, askEmail, contact?.email].join("|"),
    lastId: lastKey,
    firstId: messages[0]?.id ?? null,
    lastIsMine: last?.authorType === "contact",
    canLoadOlder: Boolean(realId && thread?.olderCursor),
    loadOlder: () => (realId ? actions.loadOlder(realId) : Promise.resolve()),
  });

  // Read new team messages out to screen-reader users.
  const announced = useRef(lastKey);
  useEffect(() => {
    if (announced.current === lastKey) return;
    const previous = announced.current;
    announced.current = lastKey;
    if (previous === null || !last || last.authorType !== "agent" || last.kind !== "text") return;
    const name = last.ai ? assistantLabel(strings, config) : (last.agent?.name ?? config?.teamName ?? strings.team);
    announce(format(strings.messageFrom, { name, body: last.body || strings.attachmentPreview }));
  }, [lastKey, last, announce, config, strings]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={scroll.onScroll} className="ys-scroll h-full overflow-x-hidden overflow-y-auto [overflow-anchor:none]">
        <div ref={contentRef} className="flex min-h-full flex-col gap-3 px-4 pt-3 pb-4">
          {!thread?.olderCursor && <ConversationIntro />}
          {realId && !thread?.loaded && !loadError && (
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-9 w-3/5 rounded-[20px]" />
              <Skeleton className="h-9 w-2/5 self-end rounded-[20px]" />
              <Skeleton className="h-14 w-2/3 rounded-[20px]" />
            </div>
          )}
          {loadError && <ErrorState message={strings.loadError} onRetry={onReload} />}
          {items.map((item) => {
            if (item.type === "day") return <DaySeparator key={item.key} at={item.at} />;
            if (item.type === "event") return <EventMarker key={item.key} message={item.message} />;
            return (
              <Fragment key={item.key}>
                <MessageGroup
                  group={item}
                  seenId={seenId}
                  handoffConversationId={handoffConversationId}
                  onRetry={onRetry}
                  onOpenImage={onOpenImage}
                  rise={!steadyGroups.current.has(item.key)}
                />
                {item.key === emailAfter && <EmailCard />}
              </Fragment>
            );
          })}
          {resolved && lastEvent?.event?.type !== "resolved" && (
            <StatusMarker resolved label={strings.conversationResolved} />
          )}
          {resolved && conversation && <RatingCard conversation={conversation} />}
          {draft && <AssistantDraftBubble draft={draft} />}
          {typing && <TypingIndicator agent={typing.agent} />}
        </div>
      </div>
      {scroll.loadingOlder && (
        <div role="status" className="ys-fade pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            {strings.loadingOlder}
          </span>
        </div>
      )}
      {scroll.showPill && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={() => scroll.scrollToBottom(true)}
            className="ys-pop pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-on-brand shadow-card"
          >
            {strings.newMessages}
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
