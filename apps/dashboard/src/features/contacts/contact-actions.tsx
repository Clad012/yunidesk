import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { applyEvent } from "@/lib/realtime/apply-event";
import { useBootstrap, useCan } from "@/hooks/use-bootstrap";
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
import { contactLabel } from "@/features/inbox/lib/labels";

/** GDPR actions, for the roles allowed: export everything, or erase the contact. */
export function ContactActions({ contact, onDeleted }: { contact: Contact; onDeleted: () => void }) {
  const canExport = useCan("contacts.export");
  const canErase = useCan("contacts.erase");
  const { agent } = useBootstrap();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => endpoints.deleteContact(contact.id),
    onSuccess: () => {
      applyEvent(qc, { type: "contact.deleted", contactId: contact.id }, agent.id);
      toast.success(copy.contactPanel.deleted);
      onDeleted();
    },
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });
  if (!canExport && !canErase) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {canExport ? (
        <Button asChild variant="outline" size="sm" className="justify-start">
          <a href={endpoints.contactExportUrl(contact.id)} download>
            <DownloadIcon /> {copy.contactPanel.exportData}
          </a>
        </Button>
      ) : null}
      {canErase ? <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2Icon /> {copy.contactPanel.deleteContact}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.contactPanel.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{fmt(copy.contactPanel.deleteBody, { name: contactLabel(contact) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => remove.mutate()} disabled={remove.isPending}>
              {copy.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog> : null}
    </div>
  );
}
