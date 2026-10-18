import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A titled block of the report, with what it shows and an optional CSV download. */
export function ReportCard({ title, hint, csvUrl, refreshing, children }: {
  title: string;
  hint: string;
  csvUrl?: string | null;
  /** Keeps the last render, dimmed, while new numbers load. */
  refreshing?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-5 shadow-xs ring-1 ring-foreground/5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        {csvUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={csvUrl} download>
              <DownloadIcon />
              {copy.reports.exportCsv}
            </a>
          </Button>
        ) : null}
      </header>
      <div className={cn("min-w-0 transition-opacity", refreshing && "opacity-60")}>{children}</div>
    </section>
  );
}
