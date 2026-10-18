import { CheckIcon, MoreHorizontalIcon } from "lucide-react";
import { AGENT_ROLES, checkMemberChange, type Agent, type AgentRole, type MemberChange } from "yunidesk";
import { copy } from "@/lib/copy";
import type { TeamMember } from "@/lib/endpoints";
import { presenceStore } from "@/lib/realtime/live";
import { useStore } from "@/lib/realtime/store";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleHint, roleLabel } from "./role-label";

interface MemberRowProps {
  member: TeamMember;
  me: Agent;
  /** Owners who aren't disabled, for the "at least one owner" rule. */
  activeOwners: number;
  onPatch: (patch: MemberChange) => void;
}

export function MemberRow({ member, me, activeOwners, onPatch }: MemberRowProps) {
  const online = useStore(presenceStore, (ids) => ids.includes(member.id));
  const isMe = member.id === me.id;
  const allowed = (change: MemberChange) => checkMemberChange(me, member, change, activeOwners) === null;
  const roles = AGENT_ROLES.filter((role) => role === member.role || allowed({ role }));
  const toggle = { disabled: !member.disabled };
  const canToggle = allowed(toggle);
  const manageable = roles.length > 1 || canToggle;

  return (
    <li className={cn("flex items-center gap-3 py-3", member.disabled && "opacity-60")}>
      <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} seed={member.id} online={online} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {member.name}
          {isMe ? <span className="text-xs font-normal text-muted-foreground">({copy.team.you})</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      {member.disabled ? <Badge variant="destructive">{copy.team.disabled}</Badge> : null}
      <Badge variant={member.role === "owner" ? "default" : "secondary"}>{roleLabel(member.role)}</Badge>
      {manageable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label={copy.common.edit}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {roles.length > 1 ? (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">{copy.team.changeRole}</DropdownMenuLabel>
                {roles.map((role: AgentRole) => (
                  <DropdownMenuItem key={role} disabled={role === member.role} onSelect={() => onPatch({ role })} className="items-start">
                    <CheckIcon className={cn("mt-0.5", role === member.role ? "opacity-100" : "opacity-0")} />
                    <span className="flex flex-col">
                      <span>{roleLabel(role)}</span>
                      <span className="text-xs text-muted-foreground">{roleHint(role)}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            {roles.length > 1 && canToggle ? <DropdownMenuSeparator /> : null}
            {canToggle ? (
              <DropdownMenuItem variant={member.disabled ? "default" : "destructive"} onSelect={() => onPatch(toggle)}>
                {member.disabled ? copy.team.enable : copy.team.disable}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-7" />
      )}
    </li>
  );
}
