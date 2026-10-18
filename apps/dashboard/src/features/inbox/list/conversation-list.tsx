import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { copy } from "@/lib/copy";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { AnimatedListItem } from "@/components/magicui/animated-list";
import { useInboxParams } from "../lib/use-inbox-params";
import { ConversationRow } from "./conversation-row";
import { ActiveFilters, ListFilterMenu } from "./list-filters";
import { ListEmpty, ListSkeleton } from "./list-states";
import { OutsideHoursBadge } from "./outside-hours-badge";
import { useConversationList } from "./use-conversation-list";

export function ConversationList() {
  const { view, q, conversationId, filters, search } = useInboxParams();
  const navigate = useNavigate();
  const { items, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useConversationList(view, q, filters);
  const filtered = Boolean(filters.tag || filters.priority);
  const sentinel = useRef<HTMLDivElement>(null);
  // Rows present on first load don't animate; later arrivals do.
  const known = useRef<Set<string> | null>(null);
  if (!isPending && known.current === null) known.current = new Set(items.map((c) => c.id));
  useEffect(() => {
    known.current = null;
  }, [view, q, filters.tag, filters.priority, filters.sort]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const move = (delta: number) => {
    if (items.length === 0) return;
    const index = items.findIndex((c) => c.id === conversationId);
    const next = items[Math.max(0, Math.min(items.length - 1, index === -1 ? 0 : index + delta))];
    if (next && next.id !== conversationId) {
      void navigate({ to: "/inbox/$view/$conversationId", params: { view, conversationId: next.id }, search });
      document.querySelector(`[data-conversation-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };
  useHotkeys({ j: () => move(1), k: () => move(-1), ArrowDown: () => move(1), ArrowUp: () => move(-1) });

  return (
    <section className="flex w-64 shrink-0 flex-col border-r xl:w-72 2xl:w-80" aria-label={copy.views[view]}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <h2 className="truncate font-semibold">{q ? `“${q}”` : copy.views[view]}</h2>
        <OutsideHoursBadge />
        <ListFilterMenu />
      </header>
      <ActiveFilters />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isPending ? (
          <ListSkeleton />
        ) : isError ? (
          <ListEmpty title={copy.list.error} action={{ label: copy.common.retry, onClick: () => void refetch() }} />
        ) : items.length === 0 ? (
          <ListEmpty
            title={q ? `${copy.list.emptySearch.replace("{q}", q)}` : view === "mine" ? copy.list.emptyMine : copy.list.empty}
            hint={q || filtered ? undefined : copy.list.emptyHint}
          />
        ) : (
          <ul className="flex flex-col gap-0.5 p-1.5">
            {items.map((conversation) => (
              <li key={conversation.id}>
                <AnimatedListItem animate={known.current !== null && !known.current.has(conversation.id)}>
                  <ConversationRow conversation={conversation} active={conversation.id === conversationId} />
                </AnimatedListItem>
              </li>
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-8">
          {isFetchingNextPage ? <p className="py-2 text-center text-xs text-muted-foreground">{copy.list.loadingMore}</p> : null}
        </div>
      </div>
    </section>
  );
}
