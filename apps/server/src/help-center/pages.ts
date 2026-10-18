import { SUPPORTED_LOCALES, format, type Locale } from "yunidesk";
import { groupByCategory, type HelpItem } from "./data";
import { html, raw, type SafeHtml } from "./html";
import { homeLinks, layout, searchForm, type Alternate, type PageContext } from "./layout";
import { plainText, renderMarkdown } from "./markdown";
import { helpCenterUrl } from "./urls";

const RECENT_COUNT = 5;
const RELATED_COUNT = 5;

function articleList(ctx: PageContext, items: readonly HelpItem[], snippets: boolean): SafeHtml {
  return html`<ul class="list">${items.map(
    (item) =>
      html`<li><a href="${helpCenterUrl("", ctx.locale, item.slug)}"><span class="item-title">${item.title}</span>${
        snippets ? html`<span class="item-snippet">${plainText(item.body, 180)}</span>` : null
      }</a></li>`,
  )}</ul>`;
}

function categoryName(ctx: PageContext, name: string | null): string {
  return name ?? ctx.strings.general;
}

function articleCount(ctx: PageContext, n: number): string {
  return format(n === 1 ? ctx.strings.articleCount_one : ctx.strings.articleCount_other, { n });
}

function homeAlternates(ctx: PageContext): Alternate[] {
  return [
    ...SUPPORTED_LOCALES.map((l) => ({ hreflang: l, href: helpCenterUrl(ctx.origin, l) })),
    { hreflang: "x-default", href: helpCenterUrl(ctx.origin, "en") },
  ];
}

export function homePage(ctx: PageContext, items: readonly HelpItem[]): SafeHtml {
  const categories = groupByCategory(items, ctx.locale);
  const recent = [...items].sort((a, b) => b.updated_at - a.updated_at).slice(0, RECENT_COUNT);
  const hero = html`<div class="hero"><div class="wrap">
<h1>${ctx.siteTitle}</h1>
<p>${ctx.siteDescription}</p>
${searchForm(ctx)}
</div></div>`;
  const main = items.length
    ? html`${
        items.length > RECENT_COUNT
          ? html`<section class="section" aria-labelledby="recent"><h2 id="recent">${ctx.strings.recentlyUpdated}</h2>${articleList(ctx, recent, false)}</section>`
          : null
      }${categories.map(
        (category, i) =>
          html`<section class="section" aria-labelledby="cat-${i}"><h2 id="cat-${i}">${categoryName(ctx, category.name)} <span class="count">${articleCount(ctx, category.items.length)}</span></h2>${articleList(ctx, category.items, true)}</section>`,
      )}`
    : html`<p class="empty">${ctx.strings.noArticles}</p>`;
  return layout(
    ctx,
    {
      title: ctx.siteTitle,
      description: ctx.siteDescription,
      canonical: helpCenterUrl(ctx.origin, ctx.locale),
      alternates: homeAlternates(ctx),
      languageLinks: homeLinks(),
    },
    main,
    hero,
  );
}

/**
 * hreflang links for an article: an item for every language is the same page in each; a translated
 * item links its published translations. Nothing when the article exists in one language only.
 */
export function articleAlternates(origin: string, item: HelpItem, translations: readonly HelpItem[]): Alternate[] {
  const versions: { locale: Locale; slug: string }[] = item.locale
    ? [{ locale: item.locale, slug: item.slug }, ...translations.flatMap((t) => (t.locale ? [{ locale: t.locale, slug: t.slug }] : []))]
    : SUPPORTED_LOCALES.map((locale) => ({ locale, slug: item.slug }));
  const byLocale = new Map(versions.map((v) => [v.locale, v.slug]));
  if (byLocale.size < 2) return [];
  const links = [...byLocale].map(([locale, slug]) => ({ hreflang: locale, href: helpCenterUrl(origin, locale, slug) }));
  const fallback = byLocale.has("en") ? "en" : item.locale!;
  return [...links, { hreflang: "x-default", href: helpCenterUrl(origin, fallback, byLocale.get(fallback)!) }];
}

export function articlePage(ctx: PageContext, item: HelpItem, translations: readonly HelpItem[], related: readonly HelpItem[]): SafeHtml {
  const alternates = articleAlternates(ctx.origin, item, translations);
  const languageLinks = { ...homeLinks() };
  for (const alt of alternates) if (alt.hreflang !== "x-default") languageLinks[alt.hreflang as Locale] = new URL(alt.href).pathname;
  const updated = new Intl.DateTimeFormat(ctx.locale, { dateStyle: "long", timeZone: "UTC" }).format(item.updated_at);
  const others = related.filter((r) => r.id !== item.id).slice(0, RELATED_COUNT);
  const category = categoryName(ctx, item.category?.trim() || null);
  const main = html`<nav class="crumbs" aria-label="${ctx.strings.breadcrumb}"><ol>
<li><a href="${helpCenterUrl("", ctx.locale)}">${ctx.strings.home}</a></li>
<li>${category}</li>
</ol></nav>
<article>
<h1 class="page-title">${item.title}</h1>
<p class="meta">${format(ctx.strings.updatedOn, { date: updated })}</p>
<div class="prose">${raw(renderMarkdown(item.body))}</div>
</article>
${others.length ? html`<section class="section" aria-labelledby="related"><h2 id="related">${format(ctx.strings.relatedInCategory, { category })}</h2>${articleList(ctx, others, false)}</section>` : null}`;
  return layout(ctx, {
    title: item.title,
    description: plainText(item.body) || ctx.siteDescription,
    canonical: helpCenterUrl(ctx.origin, ctx.locale, item.slug),
    alternates,
    languageLinks,
  }, main);
}

export function searchPage(ctx: PageContext, query: string, results: readonly HelpItem[]): SafeHtml {
  const main = html`<h1 class="page-title">${ctx.strings.searchTitle}</h1>
${searchForm(ctx, query)}
<div class="section">${
    !query
      ? html`<p class="empty">${ctx.strings.searchEmpty}</p>`
      : results.length
        ? html`<h2>${format(ctx.strings.searchResultsFor, { query })}</h2>${articleList(ctx, results, true)}`
        : html`<p class="empty" role="status">${format(ctx.strings.searchNoResults, { query })} ${ctx.strings.searchTryAgain}</p>`
  }</div>`;
  const links = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `${helpCenterUrl("", l)}/search${query ? `?q=${encodeURIComponent(query)}` : ""}`]));
  return layout(ctx, { title: query ? format(ctx.strings.searchResultsFor, { query }) : ctx.strings.searchTitle, description: ctx.siteDescription, canonical: null, alternates: [], languageLinks: links }, main);
}

export function notFoundPage(ctx: PageContext): SafeHtml {
  const main = html`<h1 class="page-title">${ctx.strings.notFoundTitle}</h1>
<p>${ctx.strings.notFoundBody}</p>
${searchForm(ctx)}
<p class="section"><a href="${helpCenterUrl("", ctx.locale)}">${ctx.strings.backToHome}</a></p>`;
  return layout(ctx, { title: ctx.strings.notFoundTitle, description: ctx.siteDescription, canonical: null, alternates: [], languageLinks: homeLinks() }, main);
}

export function sitemapXml(origin: string, items: readonly { locale: Locale | null; slug: string; updated_at: number }[]): string {
  const urls: { loc: string; lastmod?: number }[] = SUPPORTED_LOCALES.map((l) => ({ loc: helpCenterUrl(origin, l) }));
  for (const item of items) {
    for (const locale of item.locale ? [item.locale] : SUPPORTED_LOCALES) {
      urls.push({ loc: helpCenterUrl(origin, locale, item.slug), lastmod: item.updated_at });
    }
  }
  const entries = urls.map(
    (u) => html`<url><loc>${u.loc}</loc>${u.lastmod ? html`<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : null}</url>`,
  );
  return html`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`.value;
}
