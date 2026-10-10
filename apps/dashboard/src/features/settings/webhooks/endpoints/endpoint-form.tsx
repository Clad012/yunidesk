import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import type { EndpointEvent, WebhookEndpointInput } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { validHttpsUrl } from "../events";
import { EventCheckboxes } from "./event-checkboxes";

interface EndpointFormProps {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: WebhookEndpointInput) => void;
}

export function EndpointForm({ pending, error, onCancel, onSubmit }: EndpointFormProps) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<EndpointEvent[]>(["*"]);
  const badUrl = url.trim() !== "" && !validHttpsUrl(url.trim());
  const valid = validHttpsUrl(url.trim()) && events.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSubmit({ url: url.trim(), description: description.trim() || null, events });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={copy.endpoints.url} error={badUrl ? copy.endpoints.urlInvalid : null}>
        {(id) => (
          <Input id={id} type="url" required autoFocus maxLength={500} value={url} placeholder={copy.endpoints.urlPlaceholder} onChange={(e) => setUrl(e.target.value)} className="font-mono text-xs" />
        )}
      </Field>
      <Field label={copy.endpoints.description}>
        {(id) => <Input id={id} maxLength={200} value={description} placeholder={copy.endpoints.descriptionPlaceholder} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <EventCheckboxes value={events} onChange={setEvents} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? copy.endpoints.creating : copy.endpoints.create}
        </Button>
      </DialogFooter>
    </form>
  );
}
