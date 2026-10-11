import { CheckIcon, PanelRightIcon, RotateCcwIcon } from "lucide-react";
import type { AgentConversation } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { formatUntil } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { ChannelIcon } from "@/components/channel-icon";
import { contactLabel } from "../../lib/labels";
import { AiAnsweringChip } from "../ai-answering-chip";
import type { useConversationActions } from "../use-conversation-actions";
import { AssignMenu } from "./assign-menu";
import { SnoozeMenu } from "./snooze-menu";

interface ConversationHeaderProps {
  conversation: AgentConversation;
  actions: ReturnType<typeof useConversationActions>;
  panelOpen: boolean;
  onTogglePanel: () => void;
}

function StatusBadge({ conversation }: { conversation: AgentConversation }) {
  const { status, snoozedUntil } = conversation;
  const label = status === "snoozed" && snoozedUntil ? fmt(copy.conversation.snoozedUntil, { time: formatUntil(snoozedUntil) }) : copy.conversation[`status_${status}`];
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        status === "open" && "bg-primary/10 text-primary",
        status === "snoozed" && "bg-amber-500/12 text-amber-700 dark:text-amber-300",
        status === "resolved" && "bg-success/12 text-success",
      )}
    >
      {label}
    </Badge>
  );
}

export function ConversationHeader({ conversation, actions, panelOpen, onTogglePanel }: ConversationHeaderProps) {
  const resolved = conversation.status === "resolved";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <h2 className="min-w-0 truncate font-semibold">{contactLabel(conversation.contact)}</h2>
        <ChannelIcon channel={conversation.channel} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden shrink-0 lg:inline-flex"><StatusBadge conversation={conversation} /></span>
        {conversation.aiActive ? <AiAnsweringChip /> : null}
      </div>
      <AssignMenu conversation={conversation} onAssign={actions.assign} />
      <SnoozeMenu onSnooze={actions.snooze} />
      <Tip label={<span className="flex items-center gap-1.5">{resolved ? copy.conversation.reopen : copy.conversation.resolve} <Kbd className="bg-background/20 text-background">E</Kbd></span>}>
        <Button size="sm" variant={resolved ? "outline" : "default"} onClick={actions.toggleResolved}>
          {resolved ? <RotateCcwIcon /> : <CheckIcon />}
          {resolved ? copy.conversation.reopen : copy.conversation.resolve}
        </Button>
      </Tip>
      <Tip label={copy.conversation.toggleDetails}>
        <Button variant="ghost" size="icon-sm" onClick={onTogglePanel} aria-label={copy.conversation.toggleDetails} aria-pressed={panelOpen} className={cn(panelOpen && "text-primary")}>
          <PanelRightIcon />
        </Button>
      </Tip>
    </header>
  );
}
