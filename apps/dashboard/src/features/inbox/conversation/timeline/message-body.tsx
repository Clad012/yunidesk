import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Plain text with line breaks kept and http(s) links made clickable. Never renders HTML. */
export function MessageBody({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="underline decoration-current/40 underline-offset-2 hover:decoration-current">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
