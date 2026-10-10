import { useCallback } from "react";
import { createClientId, type Attachment, type SendMessageInput, type TimelineMessage } from "yunidesk";
import { useSupportCore } from "../provider/support-context";

const LOCAL_PREFIX = "local:";

/** A conversation that exists only on this device until its first message is sent. */
export function isLocalConversationId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

/**
 * Optimistic sending through the shared reducer: the message shows at once as "sending", then is
 * replaced by the server's copy (matched by clientId) or marked "failed" for tap-to-retry.
 * A new conversation lives under a temporary id until the server creates it, then is rekeyed.
 */
export function useSendMessage() {
  const { client, dispatch } = useSupportCore();

  /** Resolves with the real conversation id, or null when the send failed. */
  const deliver = useCallback(
    async (conversationId: string, draft: SendMessageInput): Promise<string | null> => {
      try {
        if (isLocalConversationId(conversationId)) {
          const { conversation, message } = await client.createConversation(draft);
          dispatch({ type: "rekey", fromId: conversationId, toId: conversation.id });
          dispatch({ type: "sent", conversationId: conversation.id, clientId: draft.clientId, message, conversation });
          return conversation.id;
        }
        const { conversation, message } = await client.sendMessage(conversationId, draft);
        dispatch({ type: "sent", conversationId, clientId: draft.clientId, message, conversation });
        return conversationId;
      } catch {
        dispatch({ type: "failed", conversationId, clientId: draft.clientId });
        return null;
      }
    },
    [client, dispatch],
  );

  /**
   * `waitFor`: the creation of this (still local) conversation is in flight; send into the real
   * conversation once it exists instead of creating a second one.
   */
  const send = useCallback(
    (conversationId: string | null, body: string, attachments: Attachment[], waitFor?: Promise<string | null>) => {
      const clientId = createClientId();
      const target = conversationId ?? `${LOCAL_PREFIX}${clientId}`;
      const draft: SendMessageInput = { body, clientId };
      if (attachments.length > 0) draft.attachmentIds = attachments.map((a) => a.id);
      const message: TimelineMessage = {
        id: `${LOCAL_PREFIX}${clientId}`,
        conversationId: target,
        authorType: "contact",
        agent: null,
        kind: "text",
        body,
        event: null,
        attachments,
        clientId,
        createdAt: Date.now(),
        delivery: "sending",
        draft,
      };
      dispatch({ type: "optimistic", conversationId: target, message });
      const done = waitFor
        ? waitFor.then((realId) => {
            if (realId) return deliver(realId, draft);
            dispatch({ type: "failed", conversationId: target, clientId });
            return null;
          })
        : deliver(target, draft);
      return { conversationId: target, done };
    },
    [deliver, dispatch],
  );

  /** Re-sends a failed message into the conversation now on screen (it may have been created since). */
  const retry = useCallback(
    (message: TimelineMessage, currentConversationId: string) => {
      if (!message.draft || message.delivery !== "failed") return null;
      dispatch({
        type: "optimistic",
        conversationId: currentConversationId,
        message: { ...message, delivery: "sending" },
      });
      return deliver(currentConversationId, message.draft);
    },
    [deliver, dispatch],
  );

  return { send, retry };
}
