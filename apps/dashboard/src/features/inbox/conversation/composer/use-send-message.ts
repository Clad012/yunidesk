import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { createClientId, type Attachment, type TimelineMessage } from "yunidesk";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { upsertMessage, type MessagePages } from "@/lib/inbox-cache";
import { applyConversation } from "@/lib/realtime/apply-event";
import { useBootstrap } from "@/hooks/use-bootstrap";

export type ComposerMode = "text" | "note";

/** Optimistic send: the message shows at once, the server copy replaces it by clientId, a failure can be retried. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const { agent } = useBootstrap();

  const write = useCallback(
    (message: TimelineMessage) => {
      const key = queryKeys.messages(conversationId);
      const data = qc.getQueryData<MessagePages>(key) ?? { pages: [], pageParams: [] };
      qc.setQueryData<MessagePages>(key, upsertMessage(data, message));
    },
    [qc, conversationId],
  );

  const deliver = useCallback(
    async (optimistic: TimelineMessage) => {
      write({ ...optimistic, delivery: "sending" });
      try {
        const draft = optimistic.draft!;
        const result = await endpoints.send(conversationId, { ...draft, kind: optimistic.kind === "note" ? "note" : "text" });
        write(result.message);
        applyConversation(qc, result.conversation, agent.id);
      } catch {
        write({ ...optimistic, delivery: "failed" });
      }
    },
    [write, conversationId, qc, agent.id],
  );

  const send = useCallback(
    (mode: ComposerMode, body: string, attachments: Attachment[]) => {
      const clientId = createClientId();
      const message: TimelineMessage = {
        id: `local_${clientId}`,
        conversationId,
        authorType: "agent",
        agent: { id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl },
        kind: mode,
        body,
        event: null,
        attachments,
        clientId,
        createdAt: Date.now(),
        delivery: "sending",
        draft: { body, attachmentIds: attachments.map((a) => a.id), clientId },
      };
      void deliver(message);
    },
    [agent, conversationId, deliver],
  );

  const retry = useCallback((message: TimelineMessage) => void deliver(message), [deliver]);

  return { send, retry };
}
