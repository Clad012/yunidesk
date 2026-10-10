import { CheckIcon, UserRoundXIcon } from "lucide-react";
import type { AgentConversation } from "yunidesk";
import { copy } from "@/lib/copy";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AssignMenuProps {
  conversation: AgentConversation;
  onAssign: (assigneeId: string | null) => void;
}

export function AssignMenu({ conversation, onAssign }: AssignMenuProps) {
  const { agent, teammates } = useBootstrap();
  const current = conversation.assignee;
  const others = teammates.filter((t) => t.id !== agent.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-44 gap-2 text-muted-foreground hover:text-foreground">
          {current ? (
            <PersonAvatar name={current.name} avatarUrl={current.avatarUrl} seed={current.id} className="size-5 text-[9px]" />
          ) : (
            <span className="size-5 rounded-full border border-dashed border-muted-foreground/50" />
          )}
          <span className="hidden truncate xl:inline">{current ? (current.id === agent.id ? copy.common.you : current.name) : copy.conversation.unassigned}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{copy.conversation.assign}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onAssign(agent.id)}>
          <PersonAvatar name={agent.name} avatarUrl={agent.avatarUrl} seed={agent.id} className="size-5 text-[9px]" />
          <span className="flex-1 truncate">{copy.conversation.assignToMe}</span>
          {current?.id === agent.id ? <CheckIcon className="text-primary" /> : null}
        </DropdownMenuItem>
        {others.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onAssign(t.id)}>
            <PersonAvatar name={t.name} avatarUrl={t.avatarUrl} seed={t.id} className="size-5 text-[9px]" />
            <span className="flex-1 truncate">{t.name}</span>
            {current?.id === t.id ? <CheckIcon className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAssign(null)}>
              <UserRoundXIcon /> {copy.conversation.unassign}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
