import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { snoozeUntil, toLocalInputValue } from "@/lib/snooze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CustomSnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (until: number) => void;
}

export function CustomSnoozeDialog({ open, onOpenChange, onSnooze }: CustomSnoozeDialogProps) {
  const [value, setValue] = useState(() => toLocalInputValue(snoozeUntil("tomorrow")));
  const at = value ? new Date(value).getTime() : Number.NaN;
  const valid = Number.isFinite(at) && at > Date.now();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSnooze(at);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.conversation.snoozeCustomTitle}</DialogTitle>
            <DialogDescription className="sr-only">{copy.conversation.snoozeCustomTitle}</DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={value} min={toLocalInputValue(Date.now())} onChange={(e) => setValue(e.target.value)} autoFocus />
          {value && !valid ? <p className="text-xs text-destructive">{copy.conversation.snoozePast}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid}>
              {copy.conversation.snoozeConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
