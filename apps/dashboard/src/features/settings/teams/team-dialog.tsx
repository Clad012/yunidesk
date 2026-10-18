import { useState, type FormEvent } from "react";
import { MAX_TEAM_NAME_LENGTH } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TeamDialogProps {
  initialName: string | null;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}

export function TeamDialog({ initialName, saving, error, onOpenChange, onSave }: TeamDialogProps) {
  const [value, setValue] = useState(initialName ?? "");
  const name = value.replace(/\s+/g, " ").trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name) onSave(name);
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initialName ? copy.teams.editTeam : copy.teams.newTeam}</DialogTitle>
            <DialogDescription>{copy.teams.teamsHint}</DialogDescription>
          </DialogHeader>
          <Field label={copy.teams.teamName} error={error}>
            {(id) => (
              <Input
                id={id}
                required
                autoFocus
                maxLength={MAX_TEAM_NAME_LENGTH}
                placeholder={copy.teams.teamNamePlaceholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" disabled={saving || !name}>
              {saving ? copy.common.saving : copy.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
