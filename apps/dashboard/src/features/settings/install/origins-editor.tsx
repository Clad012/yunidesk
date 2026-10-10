import { PlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

export function OriginsEditor({ origins, disabled, onChange }: { origins: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  const [value, setValue] = useState("");
  const candidate = value.trim().replace(/\/+$/, "");
  const invalid = candidate !== "" && !isOrigin(candidate);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!candidate || invalid) return;
    if (!origins.includes(candidate)) onChange([...origins, candidate]);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-3">
      {origins.length ? (
        <ul className="flex flex-wrap gap-2">
          {origins.map((origin) => (
            <li key={origin} className="flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-2.5 font-mono text-xs">
              {origin}
              <button type="button" disabled={disabled} onClick={() => onChange(origins.filter((o) => o !== origin))} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label={copy.common.remove}>
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={copy.install.originPlaceholder} disabled={disabled} aria-invalid={invalid} className="max-w-sm font-mono text-xs" />
        <Button type="submit" variant="outline" disabled={disabled || !candidate || invalid}>
          <PlusIcon /> {copy.install.addOrigin}
        </Button>
      </form>
      {invalid ? <p className="text-xs text-destructive">{copy.install.badOrigin}</p> : null}
    </div>
  );
}
