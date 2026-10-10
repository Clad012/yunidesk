import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentRole } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";

export function useTeam() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: queryKeys.team, queryFn: endpoints.team });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.team });
    void qc.invalidateQueries({ queryKey: queryKeys.bootstrap });
  };
  const onError = (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong));

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: AgentRole; disabled?: boolean }) => endpoints.patchMember(id, body),
    onSuccess: refresh,
    onError,
  });
  const invite = useMutation({ mutationFn: endpoints.createInvite, onSuccess: refresh, onError });
  const revoke = useMutation({
    mutationFn: endpoints.revokeInvite,
    onSuccess: () => {
      toast.success(copy.team.revoked);
      refresh();
    },
    onError,
  });
  return { team, patch, invite, revoke };
}
