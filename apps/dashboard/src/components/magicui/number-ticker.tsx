import { useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Magic UI NumberTicker: springs from the previous value to the new one. */
export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { damping: 40, stiffness: 300 });

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(
    () =>
      spring.on("change", (latest: number) => {
        if (ref.current) ref.current.textContent = Intl.NumberFormat("en").format(Math.round(latest));
      }),
    [spring],
  );

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)}>
      {Intl.NumberFormat("en").format(value)}
    </span>
  );
}
