import { useQuery } from "@tanstack/react-query";
import { endpoints, queryKeys } from "@/lib/endpoints";

export function useContactDetail(id: string) {
  return useQuery({ queryKey: queryKeys.contact(id), queryFn: () => endpoints.contact(id) });
}
