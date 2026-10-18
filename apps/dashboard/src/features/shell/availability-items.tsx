import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentAvailability } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type Bootstrap } from "@/lib/endpoints";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

/** Available / Away, in the profile menu. Away teammates are never assigned automatically. */
export function AvailabilityItems() {
  const { agent } = useBootstrap();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: endpoints.setAvailability,
    onSuccess: ({ agent: next }) => {
      qc.setQueryData<Bootstrap>(queryKeys.bootstrap, (b) =>
        b
          ? {
              ...b,
              agent: next,
              teammates: b.teammates.map((t) => (t.id === next.id ? { ...t, availability: next.availability } : t)),
            }
          : b,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.teams });
      toast.success(next.availability === "away" ? copy.availability.setAway : copy.availability.setAvailable);
    },
    onError: (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });
  return (
    <>
      <DropdownMenuLabel title={copy.availability.awayHint}>{copy.availability.label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={agent.availability}
        onValueChange={(value) => value !== agent.availability && mutation.mutate(value as AgentAvailability)}
      >
        <DropdownMenuRadioItem value="available" disabled={mutation.isPending}>
          <span className="size-2 rounded-full bg-success" /> {copy.availability.available}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="away" disabled={mutation.isPending}>
          <span className="size-2 rounded-full bg-amber-500" /> {copy.availability.away}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
