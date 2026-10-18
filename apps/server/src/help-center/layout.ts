import { LOCALE_NAMES, SUPPORTED_LOCALES, format, type HelpCenterStrings, type Locale } from "yunidesk";
import { html, raw, type SafeHtml } from "./html";
import { helpCenterUrl } from "./urls";

export const CHAT_SCRIPT_PATH = "/help/assets/chat.js";

export interface PageContext {
  locale: Locale;
  strings: HelpCenterStrings;
  /** Origin the page is served on (canonical links, sitemap). */
  origin: string;
  teamName: string;
  siteTitle: string;
  siteDescription: string;
  /** This origin may embed the messenger: load it and show "Chat with us". */
  chat: boolean;
  css: string;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute; null for pages that should not be indexed. */
  canonical: string | null;
  alternates: Alternate[];
  /** Where the language switcher points for each language (the translation, or that language's home). */
  languageLinks: Partial<Record<Locale, string>>;
}

export function homeLinks(): Partial<Record<Locale, string>> {
  return Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, helpCenterUrl("", l)]));
}

export function searchForm(ctx: PageContext, query = ""): SafeHtml {
  return html`<form class="search" role="search" action="${helpCenterUrl("", ctx.locale)}/search" method="get">
<label class="visually-hidden" for="help-search">${ctx.strings.searchLabel}</label>
<input id="help-search" type="search" name="q" maxlength="200" value="${query}" placeholder="${ctx.strings.searchPlaceholder}" autocomplete="off" enterkeyhint="search">
<button type="submit">${ctx.strings.searchButton}</button>
</form>`;
}

/** "Still need help?" — hidden until the messenger script has booted, so it never shows a dead button. */
export function chatBlock(ctx: PageContext): SafeHtml | null {
  if (!ctx.chat) return null;
  return html`<aside class="cta" aria-labelledby="cta-title" data-yd-chat-block hidden>
<div><h2 id="cta-title">${ctx.strings.stillNeedHelp}</h2><p>${ctx.strings.stillNeedHelpHint}</p></div>
<button type="button" class="btn" data-yd-chat>${ctx.strings.chatWithUs}</button>
</aside>`;
}

export function layout(ctx: PageContext, meta: PageMeta, main: SafeHtml, hero: SafeHtml | null = null): SafeHtml {
  const { strings, locale } = ctx;
  const fullTitle = meta.title === ctx.siteTitle ? meta.title : `${meta.title} · ${ctx.siteTitle}`;
  return html`<!doctype html>
<html lang="${locale}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${fullTitle}</title>
<meta name="description" content="${meta.description}">
<meta name="robots" content="${meta.canonical ? "index, follow" : "noindex, follow"}">
${meta.canonical ? html`<link rel="canonical" href="${meta.canonical}">` : null}
${meta.alternates.map((a) => html`<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">\n`)}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${ctx.siteTitle}">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${meta.description}">
${meta.canonical ? html`<meta property="og:url" content="${meta.canonical}">` : null}
<meta property="og:locale" content="${locale === "fr" ? "fr_FR" : "en_US"}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${raw(ctx.css)}</style>
${ctx.chat ? html`<script src="${CHAT_SCRIPT_PATH}" defer></script>\n<script src="/widget.js" async></script>` : null}
</head>
<body>
<a class="skip" href="#main">${strings.skipToContent}</a>
<header class="site-header">
<div class="wrap">
<a class="brand" href="${helpCenterUrl("", locale)}">${ctx.teamName} <span>${strings.home}</span></a>
<nav aria-label="${strings.language}">
<ul class="langs">${SUPPORTED_LOCALES.map((l) => {
    const href = meta.languageLinks[l] ?? helpCenterUrl("", l);
    return html`<li><a href="${href}" hreflang="${l}" lang="${l}"${l === locale ? html` aria-current="true"` : null}>${LOCALE_NAMES[l]}</a></li>`;
  })}</ul>
</nav>
</div>
</header>
<main id="main" tabindex="-1">
${hero}
<div class="wrap">
${main}
${chatBlock(ctx)}
</div></main>
</body>
</html>`;
}

export function siteTitle(ctx: { teamName: string; strings: HelpCenterStrings }, custom: string | null | undefined): string {
  return custom?.trim() || format(ctx.strings.defaultTitle, { team: ctx.teamName });
}
