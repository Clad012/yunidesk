import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RevealedSecret } from "../../revealed-secret";

/** Shows a freshly rolled signing secret once. Closing it drops the secret. */
export function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{copy.endpoints.rolledTitle}</DialogTitle>
          <DialogDescription>{copy.endpoints.rollBody}</DialogDescription>
        </DialogHeader>
        {secret ? <RevealedSecret value={secret} warning={copy.webhooks.secretShown} label={copy.endpoints.rolledTitle} /> : null}
        <DialogFooter>
          <Button onClick={onClose}>{copy.endpoints.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
