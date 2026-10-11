import { useState } from "react";
import { Bot } from "lucide-react";
import type { PublicAgent } from "yunidesk";
import { cn } from "../../lib/cn";

const FILLS = ["#e8e3ff", "#dff3ea", "#ffe8d9", "#e0efff", "#ffe2ec", "#f3ecd6"];
const INKS = ["#4b3db8", "#1d7a4f", "#a24a12", "#1f5aa6", "#a3264f", "#7a5d10"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0]];
  return letters.join("").toUpperCase();
}

function paletteIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % FILLS.length;
}

interface AvatarProps {
  agent: Pick<PublicAgent, "id" | "name" | "avatarUrl" | "isBot">;
  size?: number;
  className?: string;
}

/** A teammate's photo, or their initials on a soft fill (a robot for bots). Decorative: the name is always next to it. */
export function Avatar({ agent, size = 32, className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  // A bot (the AI assistant, an integration) never wears a person's initials.
  if (agent.isBot && (!agent.avatarUrl || broken)) return <AssistantAvatar size={size} className={className} />;
  const index = paletteIndex(agent.id);
  const showImage = agent.avatarUrl && !broken;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: showImage ? "var(--ys-soft)" : FILLS[index],
        color: INKS[index],
      }}
    >
      {showImage ? (
        <img src={agent.avatarUrl!} alt="" className="size-full object-cover" onError={() => setBroken(true)} draggable={false} />
      ) : (
        initials(agent.name)
      )}
    </span>
  );
}

interface AvatarStackProps {
  agents: readonly Pick<PublicAgent, "id" | "name" | "avatarUrl" | "isBot">[];
  size?: number;
  max?: number;
  /** Ring colour separating the overlapping avatars. */
  ringClassName?: string;
}

export function AvatarStack({ agents, size = 32, max = 3, ringClassName = "ring-surface" }: AvatarStackProps) {
  const shown = agents.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center" aria-hidden="true">
      {shown.map((agent, i) => (
        <Avatar
          key={agent.id}
          agent={agent}
          size={size}
          className={cn("ring-2", ringClassName, i > 0 && "-ml-2.5")}
        />
      ))}
    </span>
  );
}

/** The team itself (no teammate yet): initials of the team name on the brand colour. */
export function TeamAvatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand font-semibold text-on-brand", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name || "?")}
    </span>
  );
}

/** The AI assistant: a robot on a soft brand tint, so it never passes for a teammate. */
export function AssistantAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ys-brand)_16%,var(--ys-surface))] text-ink",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Bot style={{ width: Math.round(size * 0.56), height: Math.round(size * 0.56) }} strokeWidth={2} />
    </span>
  );
}
