import type { UseMutationResult } from "@tanstack/react-query";
import type { WebhookEndpointWithSecret } from "yunidesk";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import type { WebhookEndpointInput } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RevealedSecret } from "../../revealed-secret";
import { EndpointForm } from "./endpoint-form";

interface AddEndpointDialogProps {
  create: UseMutationResult<WebhookEndpointWithSecret, Error, WebhookEndpointInput>;
  onClose: () => void;
}

/** Mounted only while open, so the one-time secret leaves state when it closes. */
export function AddEndpointDialog({ create, onClose }: AddEndpointDialogProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const submit = (input: WebhookEndpointInput) => create.mutate(input, { onSuccess: (r) => setSecret(r.secret) });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => secret && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{secret ? copy.endpoints.secretTitle : copy.endpoints.add}</DialogTitle>
          <DialogDescription>{secret ? copy.endpoints.secretBody : copy.endpoints.hint}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <RevealedSecret value={secret} warning={copy.webhooks.secretShown} label={copy.endpoints.secretTitle} />
            <DialogFooter>
              <Button onClick={onClose}>{copy.endpoints.done}</Button>
            </DialogFooter>
          </>
        ) : (
          <EndpointForm pending={create.isPending} error={create.error ? errorMessage(create.error, copy.common.somethingWrong) : null} onCancel={onClose} onSubmit={submit} />
        )}
      </DialogContent>
    </Dialog>
  );
}
