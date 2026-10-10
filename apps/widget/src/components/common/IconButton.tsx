import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: "plain" | "onBrand";
}

export function IconButton({ label, children, className, tone = "plain", type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-95 disabled:cursor-default disabled:opacity-40",
        tone === "plain" ? "text-muted hover:bg-soft hover:text-fg" : "text-on-brand hover:bg-white/15",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
