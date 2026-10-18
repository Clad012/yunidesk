import { CheckCircle2, Clock3, RotateCcw, UsersRound } from "lucide-react";
import { awayEventText, format, formatDayLabel, handedOffText, type TimelineMessage } from "yunidesk";
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

/** Status changes the contact may see: resolved, reopened, the hand-off from the AI assistant, the away message. */
export function EventMarker({ message }: { message: TimelineMessage }) {
  const { strings, locale } = useMessenger();
  const event = message.event;
  const type = event?.type;
  if (event?.type === "handed_off") return <HandoffMarker label={handedOffText(strings, event, Date.now(), locale)} />;
  if (event?.type === "away") return <AwayMarker {...awayEventText(strings, event, Date.now(), locale)} />;
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

function HandoffMarker({ label }: { label: string }) {
  return (
    <div className="ys-rise flex justify-center px-6 py-1">
      <span className="flex items-center gap-1.5 rounded-2xl bg-soft px-3 py-1.5 text-center text-xs font-medium text-muted">
        <UsersRound className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

/** The automatic away message (outside business hours): the team's words, then when it's back. */
function AwayMarker({ message, back }: { message: string; back: string | null }) {
  return (
    <div className="ys-rise flex justify-center px-6 py-1" role="status">
      <div className="flex max-w-full items-start gap-2 rounded-2xl bg-soft px-3.5 py-2.5 text-[13px] leading-[18px] text-ink">
        <Clock3 className="mt-px size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block whitespace-pre-line break-words">{message}</span>
          {back && <span className="mt-0.5 block text-xs font-medium text-muted">{back}</span>}
        </span>
      </div>
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
      {config.assistant && <p className="mt-2 text-xs text-faint">{strings.aiAssistantIntro}</p>}
    </div>
  );
}
