import { TriangleAlertIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CopyButton } from "./code-block";

/** A key or secret the server shows only once: read-only, selectable, with a copy button and a warning. */
export function RevealedSecret({ value, warning, label }: { value: string; warning: string; label?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex gap-2">
        <Input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <CopyButton text={value} className="h-9" />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-note-foreground" />
        {warning}
      </p>
    </div>
  );
}
