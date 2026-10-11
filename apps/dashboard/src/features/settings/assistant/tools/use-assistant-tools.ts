import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssistantTool, AssistantToolInput } from "yunidesk";
import { toast } from "sonner";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type AssistantToolPatch } from "@/lib/endpoints";

const toastError = (e: unknown) => toast.error(errorMessage(e, copy.common.somethingWrong));

/** The tools the assistant may call, and the edits an owner can make. */
export function useAssistantTools() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.assistantTools, queryFn: endpoints.assistantTools });
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.assistantTools });
  const replace = (next: AssistantTool) =>
    qc.setQueryData<{ items: AssistantTool[] }>(queryKeys.assistantTools, (d) => (d ? { items: d.items.map((t) => (t.id === next.id ? next : t)) } : d));

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: AssistantToolInput }) => (id ? endpoints.patchAssistantTool(id, body) : endpoints.createAssistantTool(body)),
    onSuccess: (_tool, { id }) => {
      toast.success(id ? copy.assistantTools.updated : copy.assistantTools.created);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => endpoints.patchAssistantTool(id, { enabled } satisfies AssistantToolPatch),
    onSuccess: (next) => {
      replace(next);
      toast.success(next.enabled ? copy.assistantTools.enabledToast : copy.assistantTools.disabledToast);
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteAssistantTool,
    onSuccess: () => (toast.success(copy.assistantTools.deleted), refresh()),
    onError: toastError,
  });
  const roll = useMutation({ mutationFn: endpoints.rollAssistantToolSecret, onError: toastError });

  return { list, save, toggle, remove, roll };
}
