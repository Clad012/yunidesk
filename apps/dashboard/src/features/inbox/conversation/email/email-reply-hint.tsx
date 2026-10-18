import { MailIcon } from "lucide-react";
import type { AgentConversation } from "yunidesk";
import { copy, fmt } from "@/lib/copy";

/** In email conversations, says where a reply goes (notes never leave the team). */
export function EmailReplyHint({ conversation }: { conversation: AgentConversation }) {
  if (conversation.channel !== "email") return null;
  const email = conversation.contact.email;
  return (
    <span className={email ? "flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground" : "flex min-w-0 items-center gap-1 truncate text-xs text-destructive"}>
      <MailIcon className="size-3 shrink-0" />
      <span className="truncate">{email ? fmt(copy.emailMessage.composerHint, { email }) : copy.emailMessage.composerNoEmail}</span>
    </span>
  );
}
