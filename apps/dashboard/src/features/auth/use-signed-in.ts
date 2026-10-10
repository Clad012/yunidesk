import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys } from "@/lib/endpoints";

/** After login/setup/invite: drop any stale data and open the inbox. */
export function useSignedIn(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    queryClient.removeQueries();
    await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    await navigate({ to: "/inbox/$view", params: { view: "mine" } });
  };
}
