import type { AgentConversation } from "yunidesk";
import { FrownIcon, MehIcon, SmileIcon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { contactLabel } from "../../lib/labels";

const FACES = { 1: FrownIcon, 2: MehIcon, 3: SmileIcon } as const;
const TONES = { 1: "bg-destructive/10 text-destructive", 2: "bg-amber-500/12 text-amber-600 dark:text-amber-300", 3: "bg-success/12 text-success" } as const;

export function RatingCard({ conversation }: { conversation: AgentConversation }) {
  const rating = conversation.rating;
  if (!rating) return null;
  const Face = FACES[rating.score];
  return (
    <div className="mx-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONES[rating.score])}>
        <Face className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{fmt(copy.rating.title, { name: contactLabel(conversation.contact) })}</p>
        <p className="text-xs text-muted-foreground">
          {copy.rating[`score_${rating.score}`]} · {formatDateTime(rating.createdAt)}
        </p>
        {rating.comment ? <p className="mt-2 text-sm break-words whitespace-pre-wrap">“{rating.comment}”</p> : null}
      </div>
    </div>
  );
}
