import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SettingsPage({ title, subtitle, ownerOnly, children }: { title: string; subtitle: string; ownerOnly?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {ownerOnly ? (
          <p className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <LockIcon className="size-3" /> {copy.common.ownerOnly}
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function SettingsCard({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-background/40 p-5", className)}>
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className={cn(title || description ? "mt-4" : "", "flex flex-col gap-4")}>{children}</div>
    </section>
  );
}

/** Sticky bar shown while a form has unsaved changes. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="flex-1 text-sm font-medium">{copy.settings.unsaved}</span>
      <Button size="sm" variant="ghost" onClick={onDiscard} disabled={saving}>
        {copy.settings.discard}
      </Button>
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving ? copy.common.saving : copy.settings.saveChanges}
      </Button>
    </div>
  );
}
