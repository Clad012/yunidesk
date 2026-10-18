import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { can, type Permission } from "yunidesk";
import { endpoints, queryKeys, type Bootstrap } from "@/lib/endpoints";

export const bootstrapQuery = {
  queryKey: queryKeys.bootstrap,
  queryFn: endpoints.bootstrap,
  staleTime: 60_000,
};

/** The signed-in teammate, teammates and settings. Loaded before the app shell renders. */
export function useBootstrap(): Bootstrap {
  return useSuspenseQuery(bootstrapQuery).data;
}

export function useMaybeBootstrap(): Bootstrap | undefined {
  return useQuery(bootstrapQuery).data;
}

/** Whether the signed-in teammate's role allows `action` (same table the server enforces). */
export function useCan(action: Permission): boolean {
  return can(useBootstrap().agent.role, action);
}
