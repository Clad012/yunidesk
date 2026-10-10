import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SearchIcon, UsersIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { copy, fmt } from "@/lib/copy";
import { endpoints } from "@/lib/endpoints";
import { relativeShort } from "@/lib/time";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { BlurFade } from "@/components/magicui/blur-fade";
import { PersonAvatar } from "@/components/person-avatar";
import { ChannelIcon } from "@/components/channel-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { contactLabel } from "@/features/inbox/lib/labels";

export function ContactsPage() {
  const [value, setValue] = useState("");
  const q = useDebouncedValue(value.trim(), 300);
  const query = useInfiniteQuery({
    queryKey: ["contacts", q],
    queryFn: ({ pageParam }: { pageParam: string | null }) => endpoints.contacts(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((e) => e[0]?.isIntersecting && !isFetchingNextPage && void fetchNextPage());
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-4 border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">{copy.contacts.title}</h1>
        <label className="relative ml-auto flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-background px-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={copy.contacts.search} aria-label={copy.contacts.search} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
      </header>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_7rem] gap-4 border-b px-6 py-2 text-xs font-medium text-muted-foreground">
        <span>{copy.contacts.columnName}</span>
        <span>{copy.contacts.columnEmail}</span>
        <span>{copy.contacts.columnChannel}</span>
        <span className="text-right">{copy.contacts.columnLastSeen}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {query.isPending ? (
          <div className="flex flex-col gap-3 p-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : items.length === 0 ? (
          <BlurFade className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UsersIcon className="size-5" /></span>
            <p className="text-sm font-medium">{q ? fmt(copy.contacts.emptySearch, { q }) : copy.contacts.empty}</p>
          </BlurFade>
        ) : (
          <ul className="p-1.5">
            {items.map((contact) => (
              <li key={contact.id}>
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: contact.id }}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_7rem] items-center gap-4 rounded-lg px-4.5 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={contactLabel(contact)} avatarUrl={contact.avatarUrl} online={contact.online} seed={contact.id} className="size-8" />
                    <span className="truncate font-medium">{contactLabel(contact)}</span>
                  </span>
                  <span className="truncate text-muted-foreground">
                    {contact.email ?? "—"}
                    {contact.email && !contact.emailVerified ? ` · ${copy.contactPanel.unverified}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {contact.lastChannel ? <><ChannelIcon channel={contact.lastChannel} className="size-3.5" /> {copy.list[`channel_${contact.lastChannel}`]}</> : "—"}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">{contact.lastSeenAt ? relativeShort(contact.lastSeenAt) : copy.common.never}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-6" />
      </div>
    </div>
  );
}
