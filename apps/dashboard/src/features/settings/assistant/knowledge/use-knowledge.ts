import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KnowledgeInput } from "yunidesk";
import { toast } from "sonner";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";

/** The assistant's knowledge, searched on the server, and the edits an owner can make. */
export function useKnowledge(q: string) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.knowledge(q), queryFn: () => endpoints.knowledge(q), placeholderData: keepPreviousData });
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.knowledgeLists });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: KnowledgeInput }) => (id ? endpoints.patchKnowledge(id, body) : endpoints.createKnowledge(body)),
    onSuccess: (_item, { id }) => {
      toast.success(id ? copy.knowledge.updatedToast : copy.knowledge.created);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteKnowledge,
    onSuccess: () => (toast.success(copy.knowledge.deleted), refresh()),
    onError: (e) => toast.error(errorMessage(e, copy.common.somethingWrong)),
  });

  return { list, save, remove };
}
