// HTML email → plain text, for emails that have no text/plain part. The result is only ever shown
// as text (the dashboard never renders email HTML), so this is about readability, not sanitising:
// blocks become lines, <blockquote> becomes "> " lines (so quote stripping works), links keep
// their address.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  euro: "€", middot: "·", bull: "•", deg: "°",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ccedil: "ç", icirc: "î", iuml: "ï",
  ocirc: "ô", ugrave: "ù", ucirc: "û", uuml: "ü", oelig: "œ", Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : match;
    }
    return NAMED[entity] ?? NAMED[entity.toLowerCase()] ?? match;
  });
}

const DROPPED = /<(script|style|head|title|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK = new Set([
  "p", "div", "tr", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header",
  "footer", "pre", "hr", "dl", "dt", "dd", "address", "center", "form", "fieldset", "main", "aside", "nav",
]);

export function htmlToText(html: string): string {
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(DROPPED, "");
  const lines: string[] = [];
  let line = "";
  let lineDepth = 0;
  let depth = 0;
  let link: { href: string; text: string } | null = null;

  const breakLine = () => {
    lines.push(line ? `${"> ".repeat(lineDepth)}${line.trimEnd()}` : depth > 0 ? ">".repeat(depth) : "");
    line = "";
  };
  const blockBoundary = () => {
    if (line) breakLine();
  };
  const append = (text: string) => {
    if (!text) return;
    if (!line) {
      text = text.replace(/^ +/, "");
      if (!text) return;
      lineDepth = depth;
    }
    line += text;
    if (link) link.text += text;
  };

  const token = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  for (const match of source.matchAll(token)) {
    const [whole, rawTag, attributes, text] = match;
    if (text !== undefined || !rawTag) {
      append(decodeEntities(text ?? whole).replace(/[\s ]+/g, " "));
      continue;
    }
    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith("</");
    if (tag === "br") breakLine();
    else if (tag === "blockquote") {
      blockBoundary();
      depth = Math.max(0, depth + (closing ? -1 : 1));
    } else if (tag === "li" && !closing) {
      blockBoundary();
      append("- ");
    } else if (tag === "p" && closing) {
      // Paragraphs get a blank line between them, like they look.
      blockBoundary();
      breakLine();
    } else if (tag === "li" || BLOCK.has(tag)) blockBoundary();
    else if ((tag === "td" || tag === "th") && closing) append(" ");
    else if (tag === "a" && !closing) {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes ?? "");
      const url = decodeEntities(href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
      link = /^https?:\/\//i.test(url) ? { href: url, text: "" } : null;
    } else if (tag === "a" && closing && link) {
      const shown = link.text.trim();
      const current = link;
      link = null;
      if (shown && shown !== current.href && !current.href.endsWith(shown)) append(` <${current.href}>`);
      else if (!shown) append(current.href);
    }
  }
  if (line) breakLine();
  return lines
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
