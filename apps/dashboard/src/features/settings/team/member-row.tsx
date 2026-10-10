import { MoreHorizontalIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import type { TeamMember } from "@/lib/endpoints";
import { presenceStore } from "@/lib/realtime/live";
import { useStore } from "@/lib/realtime/store";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface MemberRowProps {
  member: TeamMember;
  isMe: boolean;
  canManage: boolean;
  onPatch: (patch: { role?: "owner" | "agent"; disabled?: boolean }) => void;
}

export function MemberRow({ member, isMe, canManage, onPatch }: MemberRowProps) {
  const online = useStore(presenceStore, (ids) => ids.includes(member.id));
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
      <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role === "owner" ? copy.team.owner : copy.team.agent}</Badge>
      {canManage && !isMe ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label={copy.common.edit}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onPatch({ role: member.role === "owner" ? "agent" : "owner" })}>
              {member.role === "owner" ? copy.team.makeAgent : copy.team.makeOwner}
            </DropdownMenuItem>
            <DropdownMenuItem variant={member.disabled ? "default" : "destructive"} onSelect={() => onPatch({ disabled: !member.disabled })}>
              {member.disabled ? copy.team.enable : copy.team.disable}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-7" />
      )}
    </li>
  );
}
