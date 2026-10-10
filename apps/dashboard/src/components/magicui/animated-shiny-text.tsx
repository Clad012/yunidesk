import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Magic UI AnimatedShinyText: a light sweep across muted text. */
export function AnimatedShinyText({ children, className, shimmerWidth = 100 }: { children: ReactNode; className?: string; shimmerWidth?: number }) {
  return (
    <span
      style={{ "--shiny-width": `${shimmerWidth}px` } as CSSProperties}
      className={cn(
        "text-muted-foreground/80 animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:var(--shiny-width)_100%] [transition:background-position_1s_cubic-bezier(.6,.6,0,1)_infinite]",
        "bg-gradient-to-r from-transparent via-foreground/70 via-50% to-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
