import type { UseMutationResult } from "@tanstack/react-query";
import type { CreatedApiKey } from "yunidesk";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import type { CreateApiKeyInput } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RevealedSecret } from "../revealed-secret";
import { ApiKeyForm } from "./api-key-form";

interface CreateApiKeyDialogProps {
  create: UseMutationResult<CreatedApiKey, Error, CreateApiKeyInput>;
  onClose: () => void;
}

/** Mounted only while open, so the one-time token is gone from state as soon as it closes. */
export function CreateApiKeyDialog({ create, onClose }: CreateApiKeyDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const submit = (input: CreateApiKeyInput) => create.mutate(input, { onSuccess: (created) => setToken(created.token) });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => token && e.preventDefault()}>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>{copy.apiKeys.tokenTitle}</DialogTitle>
              <DialogDescription>{copy.apiKeys.tokenBody}</DialogDescription>
            </DialogHeader>
            <RevealedSecret value={token} warning={copy.apiKeys.warning} label={copy.apiKeys.tokenTitle} />
            <DialogFooter>
              <Button onClick={onClose}>{copy.apiKeys.done}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{copy.apiKeys.dialogTitle}</DialogTitle>
              <DialogDescription>{copy.apiKeys.dialogBody}</DialogDescription>
            </DialogHeader>
            <ApiKeyForm pending={create.isPending} error={create.error ? errorMessage(create.error, copy.common.somethingWrong) : null} onCancel={onClose} onSubmit={submit} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
