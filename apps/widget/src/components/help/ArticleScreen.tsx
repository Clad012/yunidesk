import { ChevronLeft, ExternalLink } from "lucide-react";
import { useMessenger } from "../../state/context";
import { CloseButton } from "../common/CloseButton";
import { IconButton } from "../common/IconButton";
import { MessageText } from "../conversation/MessageText";

/** One FAQ answer, with a way to ask the team when it isn't enough. */
export function ArticleScreen({ articleId, helpQuery }: { articleId: string; helpQuery: string }) {
  const { strings, data, navigate, startConversation } = useMessenger();
  const article = data.help.find((item) => item.id === articleId) ?? null;
  const back = () => navigate({ name: "home", helpQuery });

  return (
    <div className="ys-fade flex min-h-0 flex-1 flex-col">
      <header className="relative z-10 flex h-16 shrink-0 items-center gap-2 bg-surface px-2 shadow-[0_10px_24px_-20px_rgb(20_20_40/0.4)]">
        <IconButton label={strings.back} onClick={back} data-autofocus>
          <ChevronLeft className="size-6" aria-hidden="true" />
        </IconButton>
        <h2 className="min-w-0 flex-1 truncate pl-1 text-[15px] font-semibold">{strings.help}</h2>
        <CloseButton />
      </header>
      <div className="ys-scroll min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-8">
        {article && (
          <article>
            <h1 className="text-xl leading-snug font-semibold tracking-[-0.01em]">{article.title}</h1>
            <p className="mt-4 text-[15px] leading-6 break-words whitespace-pre-wrap text-fg">
              <MessageText body={article.body} />
            </p>
            {article.helpCenterUrl ? (
              <a
                href={article.helpCenterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-2 hover:underline"
              >
                {strings.openInHelpCenter}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </article>
        )}
        <div className="mt-8 rounded-2xl bg-surface p-5 shadow-card">
          <p className="text-[15px] font-semibold">{strings.stillNeedHelp}</p>
          <p className="mt-1 text-sm text-muted">{data.config?.assistant ? strings.aiAssistantIntro : strings.stillNeedHelpHint}</p>
          <button
            type="button"
            onClick={() => startConversation()}
            className="mt-4 cursor-pointer rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition-transform active:scale-95"
          >
            {strings.askAQuestion}
          </button>
        </div>
      </div>
    </div>
  );
}
