import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { SsoSettings, SsoSettingsPatch } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";

type Draft = Omit<SsoSettingsPatch, "clientSecret"> & { clientSecret?: string };

/** A local draft of the SSO settings. The client secret is write-only: typed, sent once, never shown. */
export function useSsoForm(saved: SsoSettings) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({});
  const value = { ...saved, ...draft };
  const changes: SsoSettingsPatch = Object.fromEntries(
    Object.entries(draft).filter(([key, v]) =>
      key === "clientSecret" ? typeof v === "string" && v.trim() !== "" : JSON.stringify(v) !== JSON.stringify(saved[key as keyof SsoSettings]),
    ),
  );

  const save = useMutation({
    mutationFn: () => endpoints.saveSso(changes),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.sso, next);
      void qc.invalidateQueries({ queryKey: ["auth-status"] });
      setDraft({});
      toast.success(copy.security.saved);
    },
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });

  return {
    value,
    secretDraft: draft.clientSecret ?? "",
    dirty: Object.keys(changes).length > 0,
    saving: save.isPending,
    set: <K extends keyof Draft>(key: K, next: Draft[K]) => setDraft((d) => ({ ...d, [key]: next })),
    save: () => save.mutate(),
    discard: () => setDraft({}),
  };
}

export type SsoForm = ReturnType<typeof useSsoForm>;
