import { useQuery } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { EmailOriginal } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UnverifiedBadge } from "./unverified-badge";

interface FullEmailDialogProps {
  conversationId: string;
  messageId: string;
  onClose: () => void;
}

/** The whole inbound email as plain text (never rendered as HTML). */
export function FullEmailDialog({ conversationId, messageId, onClose }: FullEmailDialogProps) {
  const query = useQuery({
    queryKey: queryKeys.messageEmail(messageId),
    queryFn: () => endpoints.messageEmail(conversationId, messageId),
    staleTime: Infinity,
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.emailMessage.fullTitle}</DialogTitle>
          <DialogDescription>{copy.emailMessage.fullDescription}</DialogDescription>
        </DialogHeader>
        {query.data ? (
          <EmailBody email={query.data} />
        ) : query.isError ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4 text-sm">
            <span className="flex-1 text-destructive">{errorMessage(query.error, copy.emailMessage.loadFailed)}</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              {copy.common.retry}
            </Button>
          </div>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function EmailBody({ email }: { email: EmailOriginal }) {
  const auth = email.authentication;
  const checks = (["spf", "dkim", "dmarc"] as const).map((k) => `${k.toUpperCase()} ${auth[k] ?? "—"}`).join(" · ");
  const sentAt = email.sentAt && !Number.isNaN(Date.parse(email.sentAt)) ? formatDateTime(Date.parse(email.sentAt)) : email.sentAt;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <Row label={copy.emailMessage.from}>{email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}</Row>
        <Row label={copy.emailMessage.to}>{email.to}</Row>
        {sentAt ? <Row label={copy.emailMessage.date}>{sentAt}</Row> : null}
        <Row label={copy.emailMessage.subject}>{email.subject ?? copy.emailMessage.noSubject}</Row>
        <Row label={copy.emailMessage.checks}>
          <span className="flex flex-wrap items-center gap-2">
            {auth.verified ? (
              <span className="inline-flex items-center gap-1 text-success"><ShieldCheckIcon className="size-3.5" /> {copy.emailMessage.verified}</span>
            ) : (
              <UnverifiedBadge />
            )}
            <span className="text-xs text-muted-foreground">{checks}</span>
          </span>
        </Row>
      </dl>
      <pre className="max-h-[50vh] overflow-auto rounded-lg bg-muted/50 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words scrollbar-thin">{email.text}</pre>
      {email.skippedAttachments.length ? (
        <p className="text-xs text-muted-foreground">{fmt(copy.emailMessage.notImported, { names: email.skippedAttachments.join(", ") })}</p>
      ) : null}
    </div>
  );
}
