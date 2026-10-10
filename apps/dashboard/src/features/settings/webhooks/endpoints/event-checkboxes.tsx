import { copy } from "@/lib/copy";
import type { EndpointEvent } from "@/lib/endpoints";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WEBHOOK_EVENTS } from "../events";

interface EventCheckboxesProps {
  value: EndpointEvent[];
  onChange: (next: EndpointEvent[]) => void;
}

interface OptionProps {
  checked: boolean;
  disabled?: boolean;
  name: string;
  /** Event names are code; "All events" is plain text. */
  mono?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}

function Option({ checked, disabled, name, mono, label, onChange }: OptionProps) {
  return (
    <Label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5 font-normal", disabled && "cursor-default opacity-60")}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(on) => onChange(on === true)} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className={cn("font-medium", mono ? "font-mono text-xs" : "text-sm")}>{name}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </span>
    </Label>
  );
}

/** "All events" or a pick of individual events; picking "All events" covers the rest. */
export function EventCheckboxes({ value, onChange }: EventCheckboxesProps) {
  const all = value.includes("*");
  const toggle = (event: EndpointEvent, on: boolean) => onChange(on ? [...value, event] : value.filter((e) => e !== event));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{copy.endpoints.events}</legend>
      <Option checked={all} name={copy.endpoints.allEvents} label={copy.endpoints.allEventsHint} onChange={(on) => onChange(on ? ["*"] : [])} />
      {WEBHOOK_EVENTS.map((event) => (
        <Option
          key={event.name}
          checked={all || value.includes(event.name)}
          disabled={all}
          name={event.name}
          mono
          label={event.label}
          onChange={(on) => toggle(event.name, on)}
        />
      ))}
      {value.length === 0 ? <p className="text-xs text-destructive">{copy.endpoints.pickEvents}</p> : null}
    </fieldset>
  );
}
