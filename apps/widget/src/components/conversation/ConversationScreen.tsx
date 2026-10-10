import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { Attachment } from "yunidesk";
import { useMessenger, type Tab } from "../../state/context";
import { isTempId } from "../../state/useActions";
import { usePageVisible } from "../../hooks/usePageVisible";
import { useUploads } from "../../hooks/useUploads";
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { DropOverlay } from "./DropOverlay";
import { Lightbox } from "./Lightbox";
import { MessageList } from "./MessageList";

const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

export function ConversationScreen({ conversationId, from }: { conversationId: string | null; from: Tab }) {
  const { data, actions, strings, route, navigate, panelOpen } = useMessenger();
  const conversation = conversationId ? (data.state.conversations.find((c) => c.id === conversationId) ?? null) : null;
  const thread = conversationId ? data.state.threads[conversationId] : undefined;
  const realId = conversationId && !isTempId(conversationId) ? conversationId : null;
  const [loadError, setLoadError] = useState(false);
  const [image, setImage] = useState<Attachment | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const uploads = useUploads(data.client, strings);
  const visible = usePageVisible();

  const load = useCallback(() => {
    if (!realId) return;
    setLoadError(false);
    actions.loadThread(realId).catch(() => setLoadError(true));
  }, [realId, actions]);

  const loaded = thread?.loaded ?? false;
  useEffect(() => {
    if (realId && !loaded) load();
    // Only when the conversation changes; a reconnect refetch is handled by the data layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realId]);

  const unread = conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (realId && panelOpen && visible && unread > 0) void actions.markRead(realId);
  }, [realId, panelOpen, visible, unread, actions]);

  const send = (body: string, attachments: Attachment[]) => {
    const target = actions.send(conversationId, body, attachments);
    if (conversationId === null && route.name === "conversation") navigate({ ...route, id: target });
  };

  const dragHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      uploads.add([...e.dataTransfer.files]);
    },
  };

  return (
    <div className="ys-screen-in relative flex min-h-0 flex-1 flex-col bg-surface" {...dragHandlers}>
      <ConversationHeader conversation={conversation} from={from} />
      <MessageList
        conversationId={conversationId}
        conversation={conversation}
        thread={thread}
        loadError={loadError}
        onReload={load}
        onRetry={actions.retry}
        onOpenImage={setImage}
      />
      <Composer conversationId={conversationId} uploads={uploads} onSend={send} />
      {dragging && <DropOverlay />}
      {image && <Lightbox attachment={image} onClose={() => setImage(null)} />}
    </div>
  );
}
