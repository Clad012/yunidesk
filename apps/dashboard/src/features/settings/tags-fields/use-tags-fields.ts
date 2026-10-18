import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TagColor } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type ConversationFieldInput } from "@/lib/endpoints";

const onError = (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong));

/** Create, rename/recolour and delete tags; conversations are refetched so their chips follow. */
export function useTagMutations() {
  const qc = useQueryClient();
  const refresh = (withConversations: boolean) => {
    void qc.invalidateQueries({ queryKey: queryKeys.tags });
    if (withConversations) {
      void qc.invalidateQueries({ queryKey: queryKeys.conversationLists });
      void qc.invalidateQueries({ queryKey: ["conversation"] });
    }
  };
  const create = useMutation({
    mutationFn: (body: { name: string; color: TagColor }) => endpoints.createTag(body),
    onSuccess: () => (toast.success(copy.tagsFields.tagCreated), refresh(false)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; color?: TagColor }) => endpoints.patchTag(id, body),
    onSuccess: () => (toast.success(copy.tagsFields.tagUpdated), refresh(true)),
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteTag,
    onSuccess: () => (toast.success(copy.tagsFields.tagDeleted), refresh(true)),
    onError,
  });
  return { create, update, remove };
}

export function useFieldMutations() {
  const qc = useQueryClient();
  const refresh = (withConversations: boolean) => {
    void qc.invalidateQueries({ queryKey: queryKeys.conversationFields });
    if (withConversations) {
      void qc.invalidateQueries({ queryKey: queryKeys.conversationLists });
      void qc.invalidateQueries({ queryKey: ["conversation"] });
    }
  };
  const create = useMutation({
    mutationFn: (body: ConversationFieldInput) => endpoints.createConversationField(body),
    onSuccess: () => (toast.success(copy.tagsFields.fieldCreated), refresh(false)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; label?: string; options?: string[] }) => endpoints.patchConversationField(id, body),
    onSuccess: () => (toast.success(copy.tagsFields.fieldUpdated), refresh(false)),
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteConversationField,
    onSuccess: () => (toast.success(copy.tagsFields.fieldDeleted), refresh(true)),
    onError,
  });
  const reorder = useMutation({
    mutationFn: endpoints.reorderConversationFields,
    onSuccess: (result) => qc.setQueryData(queryKeys.conversationFields, result),
    onError: (error: Error) => (onError(error), refresh(false)),
  });
  return { create, update, remove, reorder };
}
