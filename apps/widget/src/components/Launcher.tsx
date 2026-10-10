import { ChevronDown, MessageCircle } from "lucide-react";
import { format } from "yunidesk";
import { FRAME, type Alignment } from "../bridge";
import { useMessenger } from "../state/context";
import { cn } from "../lib/cn";

interface LauncherProps {
  open: boolean;
  unread: number;
  alignment: Alignment;
  onToggle: () => void;
}

/** The round bubble in the corner: chat icon when closed, chevron when open, unread badge. */
export function Launcher({ open, unread, alignment, onToggle }: LauncherProps) {
  const { strings } = useMessenger();
  const base = open ? strings.closeMessenger : strings.openMessenger;
  const label = !open && unread > 0 ? `${base}, ${format(strings.unreadBadge, { n: unread })}` : base;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      className="ys-pop group absolute flex cursor-pointer items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_8px_24px_-6px_rgb(20_20_40/0.4),0_2px_6px_rgb(20_20_40/0.15)] transition-[transform,box-shadow] duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-8px_rgb(20_20_40/0.45),0_3px_8px_rgb(20_20_40/0.15)] active:translate-y-0 active:scale-95"
      style={{ width: FRAME.launcher, height: FRAME.launcher, bottom: FRAME.pad, [alignment]: FRAME.pad }}
    >
      <MessageCircle
        aria-hidden="true"
        className={cn(
          "absolute size-[26px] transition-[transform,opacity] duration-300 ease-out-soft",
          open ? "scale-50 -rotate-45 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
        strokeWidth={2.2}
        fill="currentColor"
        fillOpacity={0.14}
      />
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "absolute size-7 transition-[transform,opacity] duration-300 ease-out-soft",
          open ? "scale-100 rotate-0 opacity-100" : "scale-50 rotate-45 opacity-0",
        )}
        strokeWidth={2.4}
      />
      {!open && unread > 0 && (
        <span
          aria-hidden="true"
          className="ys-pop absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white ring-2 ring-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
