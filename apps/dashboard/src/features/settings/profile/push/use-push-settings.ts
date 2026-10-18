import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PushPreferences, PushSettings } from "yunidesk";
import { errorMessage } from "@/lib/api";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";

/** My push preferences (all my devices) and how many devices receive them. */
export function usePushSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.pushSettings, queryFn: endpoints.pushSettings });
  const save = useMutation({
    mutationFn: (patch: Partial<PushPreferences>) => endpoints.savePushPreferences(patch),
    onMutate: (patch) => {
      const previous = qc.getQueryData<PushSettings>(queryKeys.pushSettings);
      if (previous) qc.setQueryData<PushSettings>(queryKeys.pushSettings, { ...previous, preferences: { ...previous.preferences, ...patch } });
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.pushSettings, context.previous);
      toast.error(errorMessage(error, copy.common.somethingWrong));
    },
    onSuccess: (settings) => qc.setQueryData(queryKeys.pushSettings, settings),
  });
  return { query, save };
}

/** The server's VAPID key, fetched before the click so "Turn on" can ask for permission right away. */
export function usePushPublicKey(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.pushPublicKey, queryFn: endpoints.pushPublicKey, staleTime: Infinity, enabled });
}
