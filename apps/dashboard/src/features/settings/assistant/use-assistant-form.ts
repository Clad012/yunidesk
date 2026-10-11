import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AssistantSettings, AssistantSettingsPatch } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { assistantFormErrors, changedFields } from "./assistant-form-rules";

type Editable = Required<AssistantSettingsPatch>;

/** A local draft of the assistant settings; saves only the fields that changed. */
export function useAssistantForm(saved: AssistantSettings) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AssistantSettingsPatch>({});
  const value: AssistantSettings = { ...saved, ...draft };
  const changes = changedFields(saved, draft);
  const errors = assistantFormErrors(value);
  const valid = Object.values(errors).every((e) => e === null);

  const save = useMutation({
    mutationFn: () => endpoints.patchAssistant(changes),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.assistant, next);
      void qc.invalidateQueries({ queryKey: queryKeys.assistantUsage });
      setDraft({});
      toast.success(copy.settings.savedToast);
    },
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });

  return {
    value,
    errors,
    dirty: Object.keys(changes).length > 0,
    valid,
    saving: save.isPending,
    set: <K extends keyof Editable>(key: K, next: Editable[K]) => setDraft((d) => ({ ...d, [key]: next })),
    save: () => save.mutate(),
    discard: () => setDraft({}),
  };
}

export type AssistantForm = ReturnType<typeof useAssistantForm>;
