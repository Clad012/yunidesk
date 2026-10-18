import { copy, fmt } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { useBootstrap, useCan } from "@/hooks/use-bootstrap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard, SettingsPage } from "../settings-page";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { roleLabel } from "./role-label";
import { useTeam } from "./use-team";

export function TeamSection() {
  const { agent } = useBootstrap();
  const canManage = useCan("team.manage");
  const canManageOwners = useCan("team.manageOwners");
  const { team, patch, invite, revoke } = useTeam();
  const invites = team.data?.invites ?? [];
  const activeOwners = team.data?.agents.filter((m) => m.role === "owner" && !m.disabled).length ?? 0;

  return (
    <SettingsPage title={copy.team.title} subtitle={copy.team.subtitle}>
      <SettingsCard title={copy.team.members}>
        {team.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="-my-3 divide-y">
            {team.data?.agents.map((m) => (
              <MemberRow key={m.id} member={m} me={agent} activeOwners={activeOwners} onPatch={(body) => patch.mutate({ id: m.id, ...body })} />
            ))}
          </ul>
        )}
      </SettingsCard>
      {canManage ? (
        <>
          <SettingsCard title={copy.team.invite}>
            <InviteForm invite={invite} />
          </SettingsCard>
          <SettingsCard title={copy.team.pending}>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.team.noPending}</p>
            ) : (
              <ul className="-my-2 divide-y">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">{fmt(copy.team.expires, { date: formatDateTime(i.expiresAt) })}</p>
                    </div>
                    <Badge variant="secondary">{roleLabel(i.role)}</Badge>
                    {i.role !== "owner" || canManageOwners ? (
                      <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revoke.mutate(i.id)}>
                        {copy.team.revoke}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SettingsCard>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{copy.team.lockedHint}</p>
      )}
    </SettingsPage>
  );
}
