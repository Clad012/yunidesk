import { useCallback, useMemo, useRef } from "react";
import { createClientId, type Attachment, type TimelineMessage } from "yunidesk";
import type { MessengerData } from "./useMessengerData";

export const TEMP_PREFIX = "tmp_";
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

/** Pixel sizes measured before upload, used while the server copy has none. */
export const localImageSizes = new Map<string, { width: number; height: number }>();

export function useActions(data: MessengerData, onRekey: (fromId: string, toId: string) => void) {
  const { client, dispatch } = data;
  const stateRef = useRef(data.state);
  stateRef.current = data.state;
  const onRekeyRef = useRef(onRekey);
  onRekeyRef.current = onRekey;
  /** A new conversation being created: later messages wait for its real id. */
  const creating = useRef(new Map<string, Promise<string>>());
  const rekeyed = useRef(new Map<string, string>());
  const reading = useRef(new Set<string>());

  const deliver = useCallback(
    async (targetId: string, message: TimelineMessage) => {
      const draft = message.draft!;
      const clientId = draft.clientId;
      let conversationId = rekeyed.current.get(targetId) ?? targetId;
      try {
        if (isTempId(conversationId)) {
          const pending = creating.current.get(conversationId);
          if (pending) {
            conversationId = await pending;
          } else {
            const tempId = conversationId;
            const created = client.createConversation(draft).then((result) => {
              rekeyed.current.set(tempId, result.conversation.id);
              dispatch({ type: "rekey", fromId: tempId, toId: result.conversation.id });
              dispatch({ type: "sent", conversationId: result.conversation.id, clientId, ...result });
              onRekeyRef.current(tempId, result.conversation.id);
              return result.conversation.id;
            });
            creating.current.set(tempId, created);
            try {
              await created;
            } finally {
              creating.current.delete(tempId);
            }
            return;
          }
        }
        const result = await client.sendMessage(conversationId, draft);
        dispatch({ type: "sent", conversationId, clientId, ...result });
      } catch {
        dispatch({ type: "failed", conversationId: rekeyed.current.get(targetId) ?? conversationId, clientId });
      }
    },
    [client, dispatch],
  );

  const send = useCallback(
    (conversationId: string | null, body: string, attachments: Attachment[]): string => {
      const clientId = createClientId();
      const targetId = conversationId ?? `${TEMP_PREFIX}${clientId}`;
      const message: TimelineMessage = {
        id: `local_${clientId}`,
        conversationId: targetId,
        authorType: "contact",
        agent: null,
        kind: "text",
        body,
        event: null,
        attachments,
        clientId,
        createdAt: Date.now(),
        delivery: "sending",
        draft: { body, attachmentIds: attachments.map((a) => a.id), clientId },
      };
      dispatch({ type: "optimistic", conversationId: targetId, message });
      void deliver(targetId, message);
      return targetId;
    },
    [deliver, dispatch],
  );

  const retry = useCallback(
    (message: TimelineMessage) => {
      if (!message.draft) return;
      const next: TimelineMessage = { ...message, delivery: "sending", createdAt: Date.now() };
      dispatch({ type: "optimistic", conversationId: message.conversationId, message: next });
      void deliver(message.conversationId, next);
    },
    [deliver, dispatch],
  );

  const markRead = useCallback(
    async (conversationId: string) => {
      const conversation = stateRef.current.conversations.find((c) => c.id === conversationId);
      if (!conversation || conversation.unreadCount === 0 || reading.current.has(conversationId)) return;
      reading.current.add(conversationId);
      dispatch({ type: "conversation", conversation: { ...conversation, unreadCount: 0 } });
      try {
        await client.markRead(conversationId);
      } catch {
        // the next open retries
      } finally {
        reading.current.delete(conversationId);
      }
    },
    [client, dispatch],
  );

  const loadOlder = useCallback(
    async (conversationId: string) => {
      const before = stateRef.current.threads[conversationId]?.olderCursor;
      if (!before) return;
      const page = await client.listMessages(conversationId, { before });
      dispatch({ type: "page", conversationId, messages: page.items, olderCursor: page.nextCursor, older: true });
    },
    [client, dispatch],
  );

  const rate = useCallback(
    async (conversationId: string, score: 1 | 2 | 3, comment: string) => {
      const conversation = await client.rate(conversationId, { score, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      dispatch({ type: "conversation", conversation });
    },
    [client, dispatch],
  );

  /** "Talk to a human": the assistant stops; the conversation comes back with aiActive false. */
  const handoff = useCallback(
    async (conversationId: string) => {
      const conversation = await client.handoff(conversationId);
      dispatch({ type: "conversation", conversation });
    },
    [client, dispatch],
  );

  const saveEmail = useCallback((email: string) => client.updateContact({ email }), [client]);

  return useMemo(
    () => ({ send, retry, markRead, loadOlder, rate, handoff, saveEmail, loadThread: data.loadThread }),
    [send, retry, markRead, loadOlder, rate, handoff, saveEmail, data.loadThread],
  );
}

export type Actions = ReturnType<typeof useActions>;
