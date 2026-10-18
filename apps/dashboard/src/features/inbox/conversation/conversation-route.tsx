import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { ApiError } from "@/lib/api";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMediaQuery } from "@/hooks/use-media-query";
import { activeConversationStore } from "@/features/notifications/attention";
import { ListEmpty } from "../list/list-states";
import { Composer } from "./composer/composer";
import { composerBus } from "./composer/composer-bus";
import { useSendMessage } from "./composer/use-send-message";
import { ConversationHeader } from "./header/conversation-header";
import { ContactPanel } from "./panel/contact-panel";
import { Timeline } from "./timeline/timeline";
import { TeammatesReplying } from "./timeline/typing-row";
import { useConversation, useMarkRead, useMessages } from "./use-conversation";
import { useConversationActions } from "./use-conversation-actions";

const PANEL_KEY = "ys-contact-panel";

function readPanel(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Wide screens: a docked panel whose state is remembered. Narrow: an overlay, closed by default. */
function usePanel() {
  const wide = useMediaQuery("(min-width: 1536px)");
  const [docked, setDocked] = useState(readPanel);
  const [overlay, setOverlay] = useState(false);
  const toggle = () => {
    if (!wide) return setOverlay((o) => !o);
    setDocked((open) => {
      try {
        localStorage.setItem(PANEL_KEY, open ? "0" : "1");
      } catch {
        // per-tab only
      }
      return !open;
    });
  };
  return { wide, open: wide ? docked : overlay, toggle, close: () => setOverlay(false) };
}

export function ConversationRoute() {
  const { conversationId } = useParams({ strict: false }) as { conversationId: string };
  return <ConversationView key={conversationId} id={conversationId} />;
}

function ConversationView({ id }: { id: string }) {
  const conversation = useConversation(id);
  const messages = useMessages(id);
  const actions = useConversationActions(conversation.data);
  const { send, retry } = useSendMessage(id);
  const panel = usePanel();
  useMarkRead(conversation.data);

  useEffect(() => {
    activeConversationStore.set(id);
    return () => activeConversationStore.set(null);
  }, [id]);

  useHotkeys({
    e: () => conversation.data && actions.toggleResolved(),
    r: () => composerBus.emit("focus", "text"),
    n: () => composerBus.emit("focus", "note"),
  });

  if (conversation.isError && conversation.error instanceof ApiError && conversation.error.status === 404) {
    return <div className="flex flex-1 items-center justify-center"><ListEmpty title={copy.conversation.notFound} /></div>;
  }
  if (!conversation.data) return <div className="flex-1" />;

  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader conversation={conversation.data} actions={actions} panelOpen={panel.open} onTogglePanel={panel.toggle} />
        <Timeline
          conversation={conversation.data}
          messages={messages.messages}
          loading={messages.isPending}
          hasOlder={messages.hasNextPage}
          loadingOlder={messages.isFetchingNextPage}
          loadOlder={messages.fetchNextPage}
          onRetry={retry}
        />
        <TeammatesReplying conversationId={id} />
        <Composer conversation={conversation.data} send={send} />
      </div>
      {panel.open ? <ContactPanel conversation={conversation.data} actions={actions} overlay={!panel.wide} onClose={panel.close} /> : null}
    </div>
  );
}
