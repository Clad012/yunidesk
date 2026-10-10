import { CheckCircle2, RotateCcw } from "lucide-react";
import { format, formatDayLabel, type TimelineMessage } from "yunidesk";
import { useMessenger } from "../../state/context";
import { Avatar, TeamAvatar } from "../common/Avatar";

export function DaySeparator({ at }: { at: number }) {
  const { strings, locale } = useMessenger();
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-soft px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {formatDayLabel(strings, at, Date.now(), locale)}
      </span>
    </div>
  );
}

/** Status changes the contact may see: resolved and reopened. */
export function EventMarker({ message }: { message: TimelineMessage }) {
  const { strings } = useMessenger();
  const type = message.event?.type;
  if (type !== "resolved" && type !== "reopened") return null;
  return <StatusMarker resolved={type === "resolved"} label={type === "resolved" ? strings.conversationResolved : strings.conversationReopened} />;
}

export function StatusMarker({ resolved, label }: { resolved: boolean; label: string }) {
  const Icon = resolved ? CheckCircle2 : RotateCcw;
  return (
    <div className="ys-rise flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-muted">
      <Icon className={resolved ? "size-3.5 text-success" : "size-3.5"} aria-hidden="true" />
      {label}
    </div>
  );
}

export function TypingIndicator({ agent }: { agent: { id: string; name: string; avatarUrl: string | null } }) {
  const { strings } = useMessenger();
  const label = format(strings.typing, { name: agent.name });
  return (
    <div className="ys-rise flex items-end gap-2" role="status" aria-label={label}>
      <Avatar agent={agent} size={28} className="mb-5" />
      <div className="flex flex-col items-start gap-1">
        <div className="flex h-9 items-center gap-1 rounded-[20px] rounded-bl-md bg-soft px-4" aria-hidden="true">
          <span className="ys-dot size-1.5 rounded-full bg-muted" />
          <span className="ys-dot size-1.5 rounded-full bg-muted" />
          <span className="ys-dot size-1.5 rounded-full bg-muted" />
        </div>
        <span className="ml-1 text-[11px] text-faint" aria-hidden="true">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Top of every conversation: who you are talking to. */
export function ConversationIntro() {
  const { strings, data } = useMessenger();
  const config = data.config;
  if (!config) return null;
  const agents = config.agents.slice(0, 3);
  return (
    <div className="ys-rise flex flex-col items-center px-6 pt-4 pb-2 text-center">
      <div className="flex items-center">
        {agents.length > 0 ? (
          agents.map((agent, i) => <Avatar key={agent.id} agent={agent} size={44} className={i > 0 ? "-ml-3 ring-[3px] ring-surface" : "ring-[3px] ring-surface"} />)
        ) : (
          <TeamAvatar name={config.teamName} size={44} />
        )}
      </div>
      <p className="mt-3 text-[15px] font-semibold">{config.teamName}</p>
      <p className="mt-0.5 text-[13px] text-muted">{strings.defaultIntro}</p>
    </div>
  );
}
