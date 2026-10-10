import type { Attachment, TimelineItem, TimelineMessage } from "yunidesk";
import { useMessenger } from "../../state/context";
import { Avatar, TeamAvatar } from "../common/Avatar";
import { MessageBubble, type BubblePosition } from "./MessageBubble";
import { cn } from "../../lib/cn";

type Group = Extract<TimelineItem, { type: "group" }>;

interface Props {
  group: Group;
  seenId: string | null;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

function position(index: number, count: number): BubblePosition {
  if (count === 1) return "single";
  if (index === 0) return "first";
  return index === count - 1 ? "last" : "middle";
}

/** A run of messages from one author: name on the first, avatar on the last (team side). */
export function MessageGroup({ group, seenId, onRetry, onOpenImage }: Props) {
  const { strings, data } = useMessenger();
  const team = group.side === "team";
  const name = group.agent?.name ?? data.config?.teamName ?? strings.team;
  const last = group.messages[group.messages.length - 1];
  const status = last?.delivery === "sending" ? strings.sending : last && last.id === seenId ? strings.seen : null;
  // "Seen" may also sit on an earlier message of the group when later ones are still unread.
  const seenInside = seenId && last?.id !== seenId && group.messages.some((m) => m.id === seenId);

  return (
    <div className={cn("ys-rise flex items-end gap-2", team ? "pr-14" : "pl-14")}>
      {team && (
        <div className="mb-0.5 w-7 shrink-0">
          {group.agent ? <Avatar agent={group.agent} size={28} /> : <TeamAvatar name={name} size={28} />}
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-[3px]", team ? "items-start" : "items-end")}>
        {team && <span className="mb-0.5 ml-3 text-xs font-medium text-muted">{name}</span>}
        {group.messages.map((message, i) => (
          <div key={message.clientId ?? message.id} className={cn("flex w-full flex-col", team ? "items-start" : "items-end")}>
            <MessageBubble
              message={message}
              side={group.side}
              position={position(i, group.messages.length)}
              onRetry={onRetry}
              onOpenImage={onOpenImage}
            />
            {seenInside && message.id === seenId && <span className="mt-0.5 mr-1 text-[11px] text-faint">{strings.seen}</span>}
          </div>
        ))}
        {!team && status && (
          <span className="ys-fade mt-0.5 mr-1 text-[11px] font-medium text-faint" aria-live="polite">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
