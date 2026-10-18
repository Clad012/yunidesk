import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentConversation, ConversationPriority, CustomFields, CustomFieldValue, TeamRef } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type ConversationPatch } from "@/lib/endpoints";
import { applyConversation } from "@/lib/realtime/apply-event";
import { formatUntil } from "@/lib/time";
import { useBootstrap } from "@/hooks/use-bootstrap";

function toastFor(patch: ConversationPatch, result: AgentConversation): string | null {
  if (patch.status === "resolved") return copy.conversation.resolved;
  if (patch.status === "open") return copy.conversation.reopened;
  if (patch.status === "snoozed" && result.snoozedUntil) return fmt(copy.conversation.snoozed, { time: formatUntil(result.snoozedUntil) });
  if (patch.priority) return fmt(copy.priority.set, { priority: copy.priority[patch.priority] });
  if (patch.assigneeId !== undefined) {
    return result.assignee ? fmt(copy.conversation.assigned, { name: result.assignee.name }) : copy.conversation.unassignedToast;
  }
  if (patch.teamId !== undefined) return result.team ? fmt(copy.teams.moved, { name: result.team.name }) : copy.teams.removed;
  return null;
}

function mergeFields(current: CustomFields, patch: Record<string, CustomFieldValue | null>): CustomFields {
  const out = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") delete out[key];
    else out[key] = value;
  }
  return out;
}

/** Status, snooze, assignment, priority and field changes, applied optimistically to every cached list. */
export function useConversationActions(conversation: AgentConversation | undefined) {
  const qc = useQueryClient();
  const teams = qc.getQueryData<{ items: TeamRef[] }>(queryKeys.teams)?.items ?? [];
  const { agent, teammates } = useBootstrap();

  const mutation = useMutation({
    mutationFn: (patch: ConversationPatch) => endpoints.patchConversation(conversation!.id, patch),
    onMutate: (patch) => {
      if (!conversation) return undefined;
      const previous = conversation;
      const assignee =
        patch.assigneeId === undefined ? conversation.assignee : (teammates.find((t) => t.id === patch.assigneeId) ?? null);
      applyConversation(
        qc,
        {
          ...conversation,
          status: patch.status ?? conversation.status,
          snoozedUntil: patch.snoozedUntil !== undefined ? patch.snoozedUntil : conversation.snoozedUntil,
          assignee,
          priority: patch.priority ?? conversation.priority,
          customFields: patch.customFields ? mergeFields(conversation.customFields, patch.customFields) : conversation.customFields,
          team:
            patch.teamId === undefined
              ? conversation.team
              : (teams.map(({ id, name }) => ({ id, name })).find((t) => t.id === patch.teamId) ?? null),
        },
        agent.id,
      );
      return { previous };
    },
    onSuccess: (result, patch) => {
      applyConversation(qc, result, agent.id);
      const message = toastFor(patch, result);
      if (message) toast.success(message);
    },
    onError: (error, _patch, context) => {
      if (context?.previous) applyConversation(qc, context.previous, agent.id);
      toast.error(copy.conversation.actionFailed, { description: errorMessage(error, "") || undefined });
    },
    onSettled: () => {
      if (conversation) void qc.invalidateQueries({ queryKey: queryKeys.messages(conversation.id) });
    },
  });

  return {
    pending: mutation.isPending,
    resolve: () => mutation.mutate({ status: "resolved" }),
    reopen: () => mutation.mutate({ status: "open" }),
    toggleResolved: () => mutation.mutate({ status: conversation?.status === "resolved" ? "open" : "resolved" }),
    snooze: (until: number) => mutation.mutate({ status: "snoozed", snoozedUntil: until }),
    assign: (assigneeId: string | null) => mutation.mutate({ assigneeId }),
    setPriority: (priority: ConversationPriority) => mutation.mutate({ priority }),
    setField: (key: string, value: CustomFieldValue | null) => mutation.mutate({ customFields: { [key]: value } }),
    setTeam: (teamId: string | null) => mutation.mutate({ teamId }),
  };
}
