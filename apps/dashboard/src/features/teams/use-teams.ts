import { useQuery } from "@tanstack/react-query";
import { endpoints, queryKeys } from "@/lib/endpoints";

/** Every team with its members and open counts; refreshed when conversations change (see apply-event). */
export function useTeams() {
  return useQuery({ queryKey: queryKeys.teams, queryFn: endpoints.teams, staleTime: 30_000 });
}
