import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type Bootstrap } from "@/lib/endpoints";
import { useBootstrap, useIsOwner } from "@/hooks/use-bootstrap";

/** A local draft of some settings fields; saves only what changed. */
export function useSettingsForm<K extends keyof AdminSettings>(keys: readonly K[]) {
  const qc = useQueryClient();
  const isOwner = useIsOwner();
  const fallback = useBootstrap().settings;
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: endpoints.settings, initialData: fallback, initialDataUpdatedAt: 0 });
  const saved = settings.data;
  const [draft, setDraft] = useState<Partial<Pick<AdminSettings, K>>>({});
  const value = { ...saved, ...draft } as AdminSettings;
  const dirty = keys.some((k) => k in draft && JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));

  const save = useMutation({
    mutationFn: () => endpoints.saveSettings(draft),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.settings, next);
      qc.setQueryData<Bootstrap>(queryKeys.bootstrap, (b) => (b ? { ...b, settings: next } : b));
      setDraft({});
      toast.success(copy.settings.savedToast);
    },
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });

  return {
    value,
    isOwner,
    dirty,
    saving: save.isPending,
    set: <F extends K>(key: F, next: AdminSettings[F]) => setDraft((d) => ({ ...d, [key]: next })),
    save: () => save.mutate(),
    discard: () => setDraft({}),
  };
}
