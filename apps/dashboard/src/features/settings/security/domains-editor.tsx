import { PlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function DomainsEditor({ domains, onChange }: { domains: string[]; onChange: (next: string[]) => void }) {
  const [value, setValue] = useState("");
  const candidate = value.trim().toLowerCase().replace(/^@/, "");
  const invalid = candidate !== "" && !DOMAIN.test(candidate);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!candidate || invalid) return;
    if (!domains.includes(candidate)) onChange([...domains, candidate]);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-3">
      {domains.length ? (
        <ul className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li key={domain} className="flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-2.5 font-mono text-xs">
              {domain}
              <button type="button" onClick={() => onChange(domains.filter((d) => d !== domain))} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={copy.common.remove}>
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={copy.security.domainPlaceholder} aria-label={copy.security.domains} aria-invalid={invalid} className="max-w-xs font-mono text-xs" />
        <Button type="submit" variant="outline" disabled={!candidate || invalid}>
          <PlusIcon /> {copy.security.addDomain}
        </Button>
      </form>
      {invalid ? <p className="text-xs text-destructive">{copy.security.badDomain}</p> : null}
    </div>
  );
}
