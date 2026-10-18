import { TableIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

/** Every chart's numbers, as a table, one click away (no value is only reachable by hovering). */
export function TableToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" size="xs" className="self-start text-muted-foreground" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <TableIcon />
        {open ? copy.reports.hideTable : copy.reports.showTable}
      </Button>
      {open ? (
        <div id={id} className="max-h-72 overflow-auto rounded-lg bg-muted/50 scrollbar-thin">
          {children}
        </div>
      ) : null}
    </div>
  );
}
