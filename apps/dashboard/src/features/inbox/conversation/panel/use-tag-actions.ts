import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentConversation, Tag, TagColor } from "yunidesk";
import { errorMessage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { applyConversation } from "@/lib/realtime/apply-event";
import { useBootstrap } from "@/hooks/use-bootstrap";

type TagChange =
  | { kind: "add"; tag: Tag }
  | { kind: "create"; name: string; color: TagColor }
  | { kind: "remove"; tagId: string };

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Tag and untag a conversation, optimistically; no timeline event is written for these. */
export function useTagActions(conversation: AgentConversation) {
  const qc = useQueryClient();
  const { agent } = useBootstrap();

  const mutation = useMutation({
    mutationFn: (change: TagChange) =>
      change.kind === "remove"
        ? endpoints.untagConversation(conversation.id, change.tagId)
        : endpoints.tagConversation(
            conversation.id,
            change.kind === "add" ? { tagId: change.tag.id } : { name: change.name, color: change.color },
          ),
    onMutate: (change) => {
      const previous = conversation;
      let tags = conversation.tags;
      if (change.kind === "remove") tags = tags.filter((t) => t.id !== change.tagId);
      else if (change.kind === "add") tags = [...tags.filter((t) => t.id !== change.tag.id), change.tag].sort(byName);
      applyConversation(qc, { ...conversation, tags }, agent.id);
      return { previous };
    },
    onSuccess: (result) => applyConversation(qc, result, agent.id),
    onError: (error, _change, context) => {
      if (context?.previous) applyConversation(qc, context.previous, agent.id);
      toast.error(copy.conversation.actionFailed, { description: errorMessage(error, "") || undefined });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });

  return {
    add: (tag: Tag) => mutation.mutate({ kind: "add", tag }),
    create: (name: string, color: TagColor) => mutation.mutate({ kind: "create", name, color }),
    remove: (tagId: string) => mutation.mutate({ kind: "remove", tagId }),
  };
}
