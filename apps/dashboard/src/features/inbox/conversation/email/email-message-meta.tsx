import { MailWarningIcon } from "lucide-react";
import { useState } from "react";
import type { Message } from "yunidesk";
import { copy } from "@/lib/copy";
import { Tip } from "@/components/ui/tooltip";
import { FullEmailDialog } from "./full-email-dialog";
import { UnverifiedBadge } from "./unverified-badge";

/** Under a message that travelled by email: sender check and "Show full email" (inbound), delivery failure (outbound). */
export function EmailMessageMeta({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const email = message.email;
  if (!email) return null;

  if (email.direction === "outbound") {
    if (email.status !== "failed") return null;
    return (
      <Tip label={email.error ?? copy.emailMessage.notDelivered}>
        <span tabIndex={0} className="flex items-center gap-1 text-xs text-destructive outline-none">
          <MailWarningIcon className="size-3.5" /> {copy.emailMessage.notDelivered}
        </span>
      </Tip>
    );
  }

  return (
    <div className="flex items-center gap-2 px-1">
      {email.verified === false ? <UnverifiedBadge /> : null}
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        {copy.emailMessage.showFull}
      </button>
      {open ? <FullEmailDialog conversationId={message.conversationId} messageId={message.id} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
