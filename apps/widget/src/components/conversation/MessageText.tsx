import { linkify } from "../../lib/linkify";

/** Plain text with clickable http(s) links; newlines are kept by the bubble's pre-wrap. */
export function MessageText({ body }: { body: string }) {
  return (
    <>
      {linkify(body).map((segment, i) =>
        segment.type === "link" ? (
          <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2 hover:decoration-2">
            {segment.text}
          </a>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
