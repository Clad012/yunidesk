import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AdminSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RevealedSecret } from "../revealed-secret";

export function WebhookSecret({ hasSecret, disabled }: { hasSecret: boolean; disabled: boolean }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const generate = useMutation({
    mutationFn: endpoints.webhookSecret,
    onSuccess: (r) => {
      setSecret(r.secret);
      qc.setQueryData<AdminSettings>(queryKeys.settings, (s) => (s ? { ...s, hasWebhookSecret: true } : s));
    },
    onError: (e) => toast.error(errorMessage(e, copy.common.somethingWrong)),
  });

  const button = (
    <Button variant="outline" disabled={disabled || generate.isPending} onClick={hasSecret ? undefined : () => generate.mutate()}>
      <KeyRoundIcon /> {hasSecret ? copy.webhooks.regenerate : copy.webhooks.generate}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{hasSecret ? copy.webhooks.hasSecret : copy.webhooks.noSecret}</p>
      {secret ? <RevealedSecret value={secret} warning={copy.webhooks.secretShown} label={copy.webhooks.secret} /> : null}
      <div>
        {hasSecret ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{copy.webhooks.regenerateTitle}</AlertDialogTitle>
                <AlertDialogDescription>{copy.webhooks.regenerateBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={() => generate.mutate()}>{copy.webhooks.regenerate}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          button
        )}
      </div>
    </div>
  );
}
