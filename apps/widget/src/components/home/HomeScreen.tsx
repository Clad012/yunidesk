import { format, pickLocalized } from "yunidesk";
import { useMessenger } from "../../state/context";
import { firstName } from "../../lib/preview";
import { AvatarStack } from "../common/Avatar";
import { CloseButton } from "../common/CloseButton";
import { ErrorState, Skeleton } from "../common/States";
import { RecentMessageCard } from "./RecentMessageCard";
import { SendMessageCard } from "./SendMessageCard";

export function HomeScreen() {
  const { strings, locale, data } = useMessenger();
  const { config, contact, status, state } = data;
  const name = firstName(contact?.name);
  const greeting =
    (config && pickLocalized(config.greeting, locale)) ??
    (name ? format(strings.defaultGreetingNamed, { name }) : strings.defaultGreeting);
  const intro = (config && pickLocalized(config.intro, locale)) ?? strings.defaultIntro;
  const latest = state.conversations[0] ?? null;

  return (
    <div className="ys-scroll relative min-h-0 flex-1 overflow-y-auto">
      <header className="ys-brand-gradient ys-home-header px-6 pt-5 pb-28">
        <div className="flex h-9 items-center justify-between gap-3">
          <span className="truncate text-[15px] font-semibold opacity-95">{config?.teamName ?? ""}</span>
          <div className="flex items-center gap-2">
            {config && <AvatarStack agents={config.agents} size={34} ringClassName="ring-brand" />}
            <CloseButton tone="onBrand" />
          </div>
        </div>
        <h1 className="ys-rise mt-12 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] opacity-75">{greeting}</h1>
        <p className="ys-rise mt-1 text-[28px] leading-[1.15] font-bold tracking-[-0.02em] [animation-delay:40ms]">{intro}</p>
      </header>
      <div className="relative -mt-16 flex flex-col gap-3 px-4 pb-6">
        {status === "error" ? (
          <div className="rounded-2xl bg-surface shadow-card">
            <ErrorState message={data.error === "signin" ? strings.signInToChat : strings.loadError} onRetry={data.error === "signin" ? undefined : data.retry} />
          </div>
        ) : status !== "ready" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        ) : (
          <>
            {latest && <RecentMessageCard conversation={latest} />}
            <SendMessageCard />
          </>
        )}
      </div>
    </div>
  );
}
