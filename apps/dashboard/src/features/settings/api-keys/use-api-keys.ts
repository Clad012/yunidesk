import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";

/** API keys of the workspace. Owners only: pass `enabled: false` for everyone else so nothing is fetched. */
export function useApiKeys(enabled: boolean) {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: queryKeys.apiKeys, queryFn: endpoints.apiKeys, enabled });
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.apiKeys });

  const create = useMutation({ mutationFn: endpoints.createApiKey, onSuccess: refresh });
  const revoke = useMutation({
    mutationFn: endpoints.revokeApiKey,
    onSuccess: () => {
      toast.success(copy.apiKeys.revokedToast);
      refresh();
      // Revoking also disables the endpoints the key created.
      void qc.invalidateQueries({ queryKey: queryKeys.webhookEndpoints });
    },
    onError: (e) => toast.error(errorMessage(e, copy.common.somethingWrong)),
  });

  return { keys, create, revoke };
}
