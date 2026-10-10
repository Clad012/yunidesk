import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

interface PersonAvatarProps {
  name: string | null;
  avatarUrl?: string | null;
  online?: boolean;
  className?: string;
  /** Stable seed for the fallback colour (contact or agent id). */
  seed?: string;
}

const TINTS = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

function tint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length]!;
}

export function PersonAvatar({ name, avatarUrl, online, className, seed }: PersonAvatarProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className={cn("size-8", className)}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className={tint(seed ?? name ?? "?")}>{initials(name)}</AvatarFallback>
      </Avatar>
      {online ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-success ring-2 ring-card" /> : null}
    </span>
  );
}
