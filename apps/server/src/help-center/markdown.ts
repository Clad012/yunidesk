import markdownIt, { type MarkdownIt } from "markdown-it";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
// Only used to resolve relative links; never shown.
const RESOLVE_BASE = "https://help.invalid/";

/** http(s) and mailto, absolute or relative to this site. Everything else (javascript:, data:…) is dropped. */
export function isSafeUrl(href: string): boolean {
  const trimmed = href.trim();
  // Browsers ignore tabs and newlines inside a scheme ("java\tscript:"); refuse them outright.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(trimmed, RESOLVE_BASE).protocol);
  } catch {
    return false;
  }
}

function isExternal(href: string): boolean {
  try {
    const url = new URL(href.trim(), RESOLVE_BASE);
    return url.protocol === "mailto:" ? false : url.origin !== new URL(RESOLVE_BASE).origin;
  } catch {
    return true;
  }
}

/**
 * Knowledge is written by the team but published to anyone: raw HTML is shown as text, links and
 * images only keep http(s)/mailto addresses, and links leaving the site get rel="noopener nofollow ugc".
 */
export function createRenderer(): MarkdownIt {
  const md = markdownIt({ html: false, linkify: true, typographer: false, breaks: true });
  md.validateLink = isSafeUrl;
  const defaultLinkOpen =
    md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const href = String(token.attrGet("href") ?? "");
    if (isExternal(href)) token.attrSet("rel", "noopener nofollow ugc");
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
  const defaultImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    token.attrSet("loading", "lazy");
    token.attrSet("decoding", "async");
    return defaultImage(tokens, idx, options, env, self);
  };
  // Article titles are the page's h1; headings inside the body start at h2.
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const level = Math.min(6, Math.max(2, Number(token.tag.slice(1)) + 1));
    token.tag = `h${level}`;
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
    const open = tokens[idx - 2];
    if (open?.type === "heading_open") tokens[idx]!.tag = open.tag;
    return self.renderToken(tokens, idx, options);
  };
  return md;
}

const renderer = createRenderer();

export function renderMarkdown(body: string): string {
  return renderer.render(body);
}

/** The body as plain text (for meta descriptions and search snippets), cut to `max` characters. */
export function plainText(body: string, max = 160): string {
  const parts: string[] = [];
  for (const token of renderer.parse(body, {})) {
    if (token.type !== "inline") continue;
    for (const child of token.children ?? []) {
      if (child.type === "text" || child.type === "code_inline") parts.push(child.content);
      else if (child.type === "softbreak" || child.type === "hardbreak") parts.push(" ");
    }
    parts.push(" ");
  }
  const text = parts.join("").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
