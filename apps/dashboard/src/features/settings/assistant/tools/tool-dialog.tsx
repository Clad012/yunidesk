import type { AssistantTool, AssistantToolInput } from "yunidesk";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validHttpsUrl } from "../../webhooks/events";
import { EMPTY_INPUT_SCHEMA, parseInputSchema, TOOL_NAME } from "./tool-rules";

interface ToolDialogProps {
  initial: AssistantTool | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: AssistantToolInput) => void;
}

export function ToolDialog({ initial, saving, error, onClose, onSave }: ToolDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [schemaText, setSchemaText] = useState(() => (initial ? JSON.stringify(initial.inputSchema, null, 2) : EMPTY_INPUT_SCHEMA));
  const schema = parseInputSchema(schemaText);
  const nameOk = TOOL_NAME.test(name);
  const urlOk = validHttpsUrl(url.trim());
  const valid = nameOk && urlOk && schema.ok && description.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && schema.ok) onSave({ name, description: description.trim(), url: url.trim(), inputSchema: schema.schema });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.assistantTools.editTitle : copy.assistantTools.newTitle}</DialogTitle>
            <DialogDescription>{copy.assistantTools.dialogDescription}</DialogDescription>
          </DialogHeader>
          <Field label={copy.assistantTools.name} hint={copy.assistantTools.nameHint} error={name && !nameOk ? copy.assistantTools.nameHint : null}>
            {(id) => <Input id={id} required maxLength={41} spellCheck={false} value={name} placeholder={copy.assistantTools.namePlaceholder} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />}
          </Field>
          <Field label={copy.assistantTools.toolDescription}>
            {(id) => <Textarea id={id} required rows={3} maxLength={1000} value={description} placeholder={copy.assistantTools.toolDescriptionPlaceholder} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <Field label={copy.assistantTools.url} error={url && !urlOk ? copy.assistantTools.urlInvalid : null}>
            {(id) => <Input id={id} type="url" required value={url} placeholder={copy.assistantTools.urlPlaceholder} onChange={(e) => setUrl(e.target.value)} className="font-mono text-xs" />}
          </Field>
          <Field label={copy.assistantTools.schema} hint={copy.assistantTools.schemaHint} error={schema.ok ? error : schema.error}>
            {(id) => <Textarea id={id} rows={8} spellCheck={false} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} className="font-mono text-xs" />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" disabled={saving || !valid}>
              {saving ? copy.common.saving : copy.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
