import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { TeamMember } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";
import { Input } from "@/components/ui/input";
import { useTeams } from "@/features/teams/use-teams";
import { SettingsCard } from "../settings-page";

/** null = no limit; undefined = not a valid limit. */
function parseLimit(text: string): number | null | undefined {
  const value = text.trim();
  if (value === "") return null;
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= 1000 ? n : undefined;
}

function LimitInput({ member, editable }: { member: TeamMember; editable: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState(member.maxOpen === null ? "" : String(member.maxOpen));
  const mutation = useMutation({
    mutationFn: (maxOpen: number | null) => endpoints.setCapacity(member.id, maxOpen),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: queryKeys.teams }), toast.success(copy.assignment.capacitySaved)),
    onError: (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });
  const commit = () => {
    const limit = parseLimit(text);
    if (limit === undefined) {
      toast.error(copy.assignment.invalidLimit);
      setText(member.maxOpen === null ? "" : String(member.maxOpen));
    } else if (limit !== member.maxOpen) mutation.mutate(limit);
  };
  return (
    <Input
      inputMode="numeric"
      aria-label={`${copy.assignment.maxOpen}: ${member.name}`}
      placeholder={copy.assignment.noLimit}
      disabled={!editable || mutation.isPending}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-8 w-28 text-right"
    />
  );
}

/** Per-teammate limits on automatic assignment, for everyone in at least one team. */
export function CapacityCard() {
  const owner = useCan("teams.manage");
  const teams = useTeams();
  const members = new Map<string, TeamMember>();
  for (const team of teams.data?.items ?? []) for (const m of team.members) members.set(m.id, m);
  if (members.size === 0) return null;
  return (
    <SettingsCard title={copy.assignment.capacityTitle} description={copy.assignment.capacityHint}>
      <ul className="-my-2 divide-y">
        {[...members.values()].map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <PersonAvatar name={m.name} avatarUrl={m.avatarUrl} seed={m.id} away={m.availability === "away"} className="size-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.availability === "away" ? copy.availability.away : copy.availability.available} · {fmt(copy.teams.load, { n: m.openCount })}
              </p>
            </div>
            <LimitInput key={`${m.id}:${m.maxOpen ?? ""}`} member={m} editable={owner} />
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
