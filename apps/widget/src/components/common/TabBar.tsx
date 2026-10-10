import { House, MessagesSquare } from "lucide-react";
import { totalUnread } from "yunidesk";
import { useMessenger, type Tab } from "../../state/context";
import { cn } from "../../lib/cn";

export function TabBar({ active }: { active: Tab }) {
  const { strings, navigate, data } = useMessenger();
  const unread = totalUnread(data.state) > 0;
  const tabs: { id: Tab; label: string; Icon: typeof House; dot: boolean }[] = [
    { id: "home", label: strings.home, Icon: House, dot: false },
    { id: "messages", label: strings.messages, Icon: MessagesSquare, dot: unread },
  ];
  return (
    <nav className="relative z-10 grid shrink-0 grid-cols-2 bg-surface px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-18px_rgb(20_20_40/0.35)]">
      {tabs.map(({ id, label, Icon, dot }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => navigate({ name: id })}
            className={cn(
              "group flex cursor-pointer flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors",
              selected ? "text-ink" : "text-muted hover:text-fg",
            )}
          >
            <span className="relative">
              <Icon className={cn("size-[22px] transition-transform duration-200 group-active:scale-90")} strokeWidth={selected ? 2.4 : 2} aria-hidden="true" />
              {dot && <span className="ys-pop absolute -top-0.5 -right-1 size-2.5 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
