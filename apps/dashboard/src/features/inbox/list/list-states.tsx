import { InboxIcon } from "lucide-react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-1.5">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-lg p-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListEmpty({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <BlurFade className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <InboxIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? (
        <Button size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </BlurFade>
  );
}
