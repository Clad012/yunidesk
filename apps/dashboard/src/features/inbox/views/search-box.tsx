import { useNavigate } from "@tanstack/react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { Kbd } from "@/components/ui/kbd";
import { useInboxParams } from "../lib/use-inbox-params";

/** Server-side search; the query lives in the URL (?q=). */
export function SearchBox() {
  const { view, q, filters } = useInboxParams();
  const navigate = useNavigate();
  const [value, setValue] = useState(q);
  const debounced = useDebouncedValue(value.trim(), 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys({ "/": () => inputRef.current?.focus() });

  useEffect(() => {
    if (debounced === q) return;
    void navigate({ to: "/inbox/$view", params: { view }, search: debounced ? { ...filters, q: debounced } : filters, replace: true });
    // Only react to the typed value; navigating changes q.
  }, [debounced]);

  return (
    <label className="relative flex h-9 items-center gap-2 rounded-lg border bg-card px-2.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            e.currentTarget.blur();
          }
        }}
        placeholder={copy.views.search}
        aria-label={copy.views.searchLabel}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button type="button" onClick={() => setValue("")} className="text-muted-foreground hover:text-foreground" aria-label={copy.common.remove}>
          <XIcon className="size-3.5" />
        </button>
      ) : (
        <Kbd>/</Kbd>
      )}
    </label>
  );
}
