import { ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { format, HELP_HOME_COUNT, searchHelp } from "yunidesk";
import { useMessenger } from "../../state/context";

/** Home's Help section: search the FAQ, open an answer, or ask the team when nothing fits. */
export function HelpCard({ initialQuery = "" }: { initialQuery?: string }) {
  const { strings, data, navigate, startConversation } = useMessenger();
  const [query, setQuery] = useState(initialQuery);
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchHelp(data.help, query) : data.help.slice(0, HELP_HOME_COUNT)),
    [data.help, query, searching],
  );

  return (
    <section aria-label={strings.help} className="ys-rise overflow-hidden rounded-2xl bg-surface shadow-card [animation-delay:90ms]">
      <div className="p-2">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-soft pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-brand/40">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.searchHelp}
            aria-label={strings.searchHelp}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {searching ? (
            <button
              type="button"
              aria-label={strings.clearSearch}
              onClick={() => setQuery("")}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-soft-strong hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <Search className="mr-2 size-[18px] text-brand" aria-hidden="true" />
          )}
        </label>
      </div>
      {results.length > 0 ? (
        <ul className="pb-2">
          {results.map((article) => (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => navigate({ name: "article", id: article.id, helpQuery: query })}
                className="group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-soft"
              >
                <span className="min-w-0 flex-1">{article.title}</span>
                <ChevronRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2 px-4 pt-1 pb-4">
          <p className="text-sm text-muted">{format(strings.helpNoResults, { query: query.trim() })}</p>
          <button
            type="button"
            onClick={() => startConversation(query.trim())}
            className="cursor-pointer rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition-transform active:scale-95"
          >
            {strings.askUsInstead}
          </button>
        </div>
      )}
    </section>
  );
}
