import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Magic UI AnimatedList item: springs in from above. Unlike the original (which reveals items on a timer),
 * the list renders live data, so only items mounted after the first render animate.
 */
export function AnimatedListItem({ children, animate }: { children: ReactNode; animate: boolean }) {
  if (!animate) return <>{children}</>;
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0, y: -12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 40 }}
      layout="position"
    >
      {children}
    </motion.div>
  );
}
