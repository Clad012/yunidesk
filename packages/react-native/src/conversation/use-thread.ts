import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactConversation, Thread } from "yunidesk";
import { useMessengerState, useSupportCore } from "../provider/support-context";
import { isLocalConversationId } from "./use-send-message";

export interface ThreadView {
  conversation: ContactConversation | null;
  thread: Thread | null;
  loadingOlder: boolean;
  failed: boolean;
  loadOlder: () => void;
  reload: () => void;
}

/**
 * Loads the newest page when the conversation opens and after every reconnect, pages back on demand,
 * and marks the conversation read while it is on screen and the app is in the foreground.
 */
export function useThread(conversationId: string | null): ThreadView {
  const { client, dispatch, syncTick, appActive } = useSupportCore();
  const { conversations, threads } = useMessengerState();
  const remoteId = conversationId && !isLocalConversationId(conversationId) ? conversationId : null;
  const conversation = remoteId ? (conversations.find((c) => c.id === remoteId) ?? null) : null;
  const thread = conversationId ? (threads[conversationId] ?? null) : null;
  const [failed, setFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const olderInFlight = useRef(false);
  const knownConversation = useRef(false);
  knownConversation.current = conversation !== null;

  useEffect(() => {
    if (!remoteId) return;
    let cancelled = false;
    client
      .listMessages(remoteId)
      .then((page) => {
        if (cancelled) return;
        dispatch({
          type: "page",
          conversationId: remoteId,
          messages: page.items,
          olderCursor: page.nextCursor,
          older: false,
        });
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    // Opened from a deep link or push before the list loaded.
    if (!knownConversation.current) {
      client
        .getConversation(remoteId)
        .then((c) => !cancelled && dispatch({ type: "conversation", conversation: c }))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [client, dispatch, remoteId, syncTick, reloadKey]);

  const olderCursor = thread?.olderCursor ?? null;
  const loadOlder = useCallback(() => {
    if (!remoteId || !olderCursor || olderInFlight.current) return;
    olderInFlight.current = true;
    setLoadingOlder(true);
    client
      .listMessages(remoteId, { before: olderCursor })
      .then((page) =>
        dispatch({
          type: "page",
          conversationId: remoteId,
          messages: page.items,
          olderCursor: page.nextCursor,
          older: true,
        }),
      )
      .catch(() => undefined)
      .finally(() => {
        olderInFlight.current = false;
        setLoadingOlder(false);
      });
  }, [client, dispatch, remoteId, olderCursor]);

  const unread = conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (!remoteId || !conversation || unread === 0 || !appActive) return;
    dispatch({ type: "conversation", conversation: { ...conversation, unreadCount: 0 } });
    client.markRead(remoteId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the unread count changes, not on every snapshot
  }, [client, dispatch, remoteId, unread, appActive]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { conversation, thread, loadingOlder, failed, loadOlder, reload };
}
