import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

interface DotPatternProps extends SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  cr?: number;
}

/** Magic UI DotPattern: a subtle dotted SVG background. */
export function DotPattern({ width = 18, height = 18, cr = 1, className, ...props }: DotPatternProps) {
  const id = useId();
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full fill-foreground/15", className)} {...props}>
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
          <circle cx={width / 2} cy={height / 2} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
