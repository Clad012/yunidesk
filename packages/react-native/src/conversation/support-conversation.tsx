import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { lastSeenMessageId, type Attachment, type TimelineMessage } from "yunidesk";
import { Composer } from "../composer/composer";
import { useMessengerState, useSupportCore } from "../provider/support-context";
import { KeyboardAvoider } from "../ui/keyboard-avoider";
import { ConversationHeader } from "./conversation-header";
import { ImageViewer } from "./image-viewer";
import { MessageList } from "./message-list";
import { conversationRows } from "./timeline-rows";
import { isLocalConversationId, useSendMessage } from "./use-send-message";
import { useThread } from "./use-thread";

export interface SupportConversationProps {
  /** The conversation to show; leave it out (or null) to start a new one with the first message. */
  conversationId?: string | null;
  /** A new conversation now exists on the server (update your route params here). */
  onConversationCreated?: (conversationId: string) => void;
  onBack?: () => void;
  onClose?: () => void;
  /** Show the built-in header (default true). Turn off to use your navigator's header. */
  showHeader?: boolean;
  /** Pad for the status bar (default true). */
  safeTop?: boolean;
  /** Pad for the home indicator (default true). */
  safeBottom?: boolean;
  /** Extra keyboard offset for chrome the SDK can't measure (rarely needed). */
  keyboardOffset?: number;
  /** For a new conversation: text already in the composer. */
  initialText?: string;
}

export function SupportConversation({
  conversationId = null,
  onConversationCreated,
  onBack,
  onClose,
  showHeader = true,
  safeTop = true,
  safeBottom = true,
  keyboardOffset = 0,
  initialText,
}: SupportConversationProps) {
  const { config, contact, theme, strings, activate } = useSupportCore();
  const { typing, teamOnline, assistantDrafts } = useMessengerState();
  useEffect(activate, [activate]);

  // Starts as the prop; a new conversation moves from its temporary id to the server's.
  const [currentId, setCurrentId] = useState<string | null>(conversationId);
  useEffect(() => setCurrentId(conversationId), [conversationId]);
  const creating = useRef<Promise<string | null> | null>(null);

  const { conversation, thread, loadingOlder, loadOlder } = useThread(currentId);
  const { send, retry } = useSendMessage();
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const remoteId = currentId && !isLocalConversationId(currentId) ? currentId : null;

  const createdRef = useRef(onConversationCreated);
  createdRef.current = onConversationCreated;
  const track = useCallback((target: string, done: Promise<string | null>) => {
    if (!isLocalConversationId(target)) return;
    creating.current ??= done;
    void done.then((realId) => {
      if (creating.current === done) creating.current = null;
      if (!realId) return;
      setCurrentId((current) => (current === target ? realId : current));
      createdRef.current?.(realId);
    });
  }, []);

  const onSend = useCallback(
    (body: string, attachments: Attachment[]) => {
      const pending = currentId && isLocalConversationId(currentId) ? creating.current : null;
      const { conversationId: target, done } = send(currentId, body, attachments, pending ?? undefined);
      if (!currentId) setCurrentId(target);
      if (!pending) track(target, done);
    },
    [currentId, send, track],
  );

  const onRetry = useCallback(
    (message: TimelineMessage) => {
      if (!currentId) return;
      const done = retry(message, currentId);
      if (done && !creating.current) track(currentId, done);
    },
    [currentId, retry, track],
  );

  const messages = thread?.messages;
  const rows = useMemo(() => {
    const list = messages ?? [];
    const askEmail =
      !!config?.askEmailForAnonymous &&
      contact?.isIdentified === false &&
      list.some((m) => m.authorType === "contact" && !m.delivery);
    return conversationRows(list, {
      showWelcome: !remoteId || (!!thread?.loaded && thread.olderCursor === null),
      typingAgent: remoteId ? (typing[remoteId]?.agent ?? null) : null,
      assistantDraft: remoteId ? (assistantDrafts[remoteId] ?? null) : null,
      showRating: conversation?.status === "resolved",
      showEmailPrompt: askEmail,
    });
  }, [
    messages,
    config,
    contact,
    remoteId,
    thread?.loaded,
    thread?.olderCursor,
    typing,
    assistantDrafts,
    conversation?.status,
  ]);

  const seenId = useMemo(
    () => (messages ? lastSeenMessageId(messages, conversation?.agentLastReadAt ?? null) : null),
    [messages, conversation?.agentLastReadAt],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {showHeader ? (
        <ConversationHeader conversation={conversation} onBack={onBack} onClose={onClose} safeTop={safeTop} />
      ) : null}
      <KeyboardAvoider extraOffset={keyboardOffset}>
        <MessageList
          rows={rows}
          conversation={conversation}
          seenId={seenId}
          online={teamOnline}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onRetry={onRetry}
          onOpenImage={setViewing}
        />
        <Composer
          typingConversationId={remoteId}
          onSend={onSend}
          safeBottom={safeBottom}
          initialText={conversationId === null ? initialText : undefined}
        />
      </KeyboardAvoider>
      <ImageViewer attachment={viewing} strings={strings} onClose={() => setViewing(null)} />
    </View>
  );
}
