import { Hono } from "hono";
import { format, getHelpCenterStrings, pickLocalized, type Locale } from "yunidesk";
import type { AppContext, AppEnv } from "../app-env";
import { embedOriginsFrom } from "../lib/settings";
import { helpCenterColors } from "./color";
import { findPublished, listAllPublished, listPublished, listRelated, loadState, MAX_QUERY_LENGTH, publishedTranslations, searchPublished, type HelpCenterState } from "./data";
import { siteTitle, type PageContext } from "./layout";
import { negotiateLocale, parseLocale } from "./locale";
import { articlePage, homePage, notFoundPage, searchPage, sitemapXml } from "./pages";
import { ensureSlugs, SLUG_PATTERN } from "./slug";
import { helpCenterCss } from "./styles";
import { helpCenterUrl } from "./urls";

/** Bump when the page templates change, so browsers drop pages cached under the old ETag. */
const RENDER_VERSION = 1;
const PAGE_CACHE = "public, max-age=60, stale-while-revalidate=300";

/** Boots the messenger and wires "Chat with us". Served from this origin: the pages run no inline script. */
const CHAT_SCRIPT = `(function () {
  var block = document.querySelector("[data-yd-chat-block]");
  if (!block) return;
  var w = window;
  w.Yunidesk = w.Yunidesk || function () { (w.Yunidesk.q = w.Yunidesk.q || []).push(arguments); };
  w.Yunidesk("boot", { locale: document.documentElement.lang });
  block.querySelector("[data-yd-chat]").addEventListener("click", function () { w.Yunidesk("open"); });
  block.hidden = false;
})();
`;

/**
 * The page CSP: nothing inline runs; the one inline stylesheet is allowed by its hash. Scripts and
 * frames only from this origin (the messenger loader and its iframe).
 */
export function helpCenterCsp(styleHash: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src '${styleHash}'`,
    "img-src 'self' https:",
    "frame-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function requestOrigin(c: AppContext): string {
  return new URL(c.req.url).origin;
}

/** The messenger is offered only where it can open: this origin may embed it and visitors may chat. */
function chatAllowed(c: AppContext, state: HelpCenterState): boolean {
  return state.settings.allowAnonymous && embedOriginsFrom(c.env, state.settings).includes(requestOrigin(c));
}

function pageContext(c: AppContext, state: HelpCenterState, locale: Locale): PageContext {
  const { settings } = state;
  const strings = getHelpCenterStrings(locale);
  const base = { teamName: settings.teamName, strings };
  return {
    locale,
    strings,
    origin: requestOrigin(c),
    teamName: settings.teamName,
    siteTitle: siteTitle(base, pickLocalized(settings.helpCenter.title, locale)),
    siteDescription:
      pickLocalized(settings.helpCenter.description ?? {}, locale)?.trim() || format(strings.defaultDescription, { team: settings.teamName }),
    chat: chatAllowed(c, state),
    css: helpCenterCss(helpCenterColors(settings.brandColor)),
  };
}

/** Changes with the settings, any knowledge item, the env's embed origins and the templates. */
async function etagFor(c: AppContext, state: HelpCenterState): Promise<string> {
  const hash = await sha256Base64(`${RENDER_VERSION}|${state.version}|${c.env.ALLOWED_ORIGINS ?? ""}`);
  return `W/"${hash.slice(0, 27)}"`;
}

function notModified(c: AppContext, etag: string): boolean {
  const header = c.req.header("if-none-match");
  return Boolean(header && header.split(",").some((tag) => tag.trim() === etag));
}

async function send(c: AppContext, ctx: PageContext, body: string, status: 200 | 404, etag: string | null): Promise<Response> {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": helpCenterCsp(`sha256-${await sha256Base64(ctx.css)}`),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cache-control": status === 200 ? PAGE_CACHE : "public, max-age=60",
    "content-language": ctx.locale,
  });
  if (etag) headers.set("etag", etag);
  return new Response(body, { status, headers });
}

type Render = (ctx: PageContext) => Promise<{ html: string; status: 200 | 404 }>;

/** Loads settings + version, answers 304 when the browser's copy is current, otherwise renders. */
async function respond(c: AppContext, locale: Locale | null, render: Render): Promise<Response> {
  const state = await loadState(c.env);
  if (!state.settings.helpCenter.enabled) return c.text("Not found", 404);
  const etag = await etagFor(c, state);
  if (notModified(c, etag)) return new Response(null, { status: 304, headers: { etag, "cache-control": PAGE_CACHE } });
  await ensureSlugs(c.env);
  const ctx = pageContext(c, state, locale ?? negotiateLocale(c.req.header("accept-language")));
  if (!locale) return send(c, ctx, (await renderNotFound(ctx)).html, 404, null);
  const page = await render(ctx);
  return send(c, ctx, page.html, page.status, page.status === 200 ? etag : null);
}

async function renderNotFound(ctx: PageContext): Promise<{ html: string; status: 404 }> {
  return { html: notFoundPage(ctx).value, status: 404 };
}

export const helpCenterRoutes = new Hono<AppEnv>();

const toLanguageHome = async (c: AppContext) => {
  const state = await loadState(c.env);
  if (!state.settings.helpCenter.enabled) return c.text("Not found", 404);
  const locale = negotiateLocale(c.req.header("accept-language"));
  return new Response(null, {
    status: 302,
    headers: { location: helpCenterUrl("", locale), vary: "Accept-Language", "cache-control": "private, max-age=300" },
  });
};
helpCenterRoutes.get("/", toLanguageHome);
helpCenterRoutes.get("", toLanguageHome);

helpCenterRoutes.get("/assets/chat.js", (c) => {
  c.header("content-type", "text/javascript; charset=utf-8");
  c.header("cache-control", "public, max-age=3600");
  c.header("x-content-type-options", "nosniff");
  return c.body(CHAT_SCRIPT);
});

helpCenterRoutes.get("/sitemap.xml", async (c) => {
  const state = await loadState(c.env);
  if (!state.settings.helpCenter.enabled) return c.text("Not found", 404);
  await ensureSlugs(c.env);
  c.header("content-type", "application/xml; charset=utf-8");
  c.header("cache-control", "public, max-age=3600");
  return c.body(sitemapXml(requestOrigin(c), await listAllPublished(c.env)));
});

helpCenterRoutes.get("/:locale", (c) =>
  respond(c, parseLocale(c.req.param("locale")), async (ctx) => ({ html: homePage(ctx, await listPublished(c.env, ctx.locale)).value, status: 200 })),
);
helpCenterRoutes.get("/:locale/", (c) => c.redirect(helpCenterUrl("", parseLocale(c.req.param("locale")) ?? "en"), 301));

helpCenterRoutes.get("/:locale/search", (c) =>
  respond(c, parseLocale(c.req.param("locale")), async (ctx) => {
    const query = (c.req.query("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const results = query ? await searchPublished(c.env, ctx.locale, query) : [];
    return { html: searchPage(ctx, query, results).value, status: 200 };
  }),
);

helpCenterRoutes.get("/:locale/:slug", (c) =>
  respond(c, parseLocale(c.req.param("locale")), async (ctx) => {
    const slug = c.req.param("slug");
    const item = SLUG_PATTERN.test(slug) ? await findPublished(c.env, ctx.locale, slug) : null;
    if (!item) return renderNotFound(ctx);
    const [translations, related] = await Promise.all([publishedTranslations(c.env, item), listRelated(c.env, ctx.locale, item, 6)]);
    return { html: articlePage(ctx, item, translations, related).value, status: 200 };
  }),
);

helpCenterRoutes.all("*", (c) => (c.req.path === "/help/" ? toLanguageHome(c) : respond(c, null, renderNotFound)));

/** robots.txt while the help center is on: the help pages may be indexed, the app may not. */
export async function robotsTxt(c: AppContext): Promise<Response | null> {
  const state = await loadState(c.env);
  if (!state.settings.helpCenter.enabled) return null;
  return new Response(`User-agent: *\nAllow: /help\nDisallow: /\n\nSitemap: ${requestOrigin(c)}/help/sitemap.xml\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
