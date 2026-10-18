import { describe, expect, it } from "vitest";
import { getHelpCenterStrings } from "yunidesk";
import { groupByCategory, helpSearchQuery, type HelpItem } from "../src/help-center/data";
import { negotiateLocale } from "../src/help-center/locale";
import { isSafeUrl, plainText, renderMarkdown } from "../src/help-center/markdown";
import { articleAlternates, searchPage } from "../src/help-center/pages";
import { assignSlugs, isValidSlug, slugify, uniqueSlug } from "../src/help-center/slug";

const item = (over: Partial<HelpItem>): HelpItem => ({
  id: "kno_1",
  title: "Title",
  body: "Body",
  locale: "en",
  slug: "title",
  category: null,
  position: 0,
  translation_group: null,
  updated_at: 1,
  ...over,
});

describe("help center markdown", () => {
  it("shows raw HTML as text instead of running it", () => {
    const out = renderMarkdown('Hi <script>alert(1)</script> <img src=x onerror="alert(1)"> <b>bold</b> <a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/<script|<img|<b>|<a /);
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("drops links and images that are not http(s) or mailto", () => {
    const out = renderMarkdown(
      "[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html;base64,PHNjcmlwdD4=) ![d](data:image/png;base64,iVBOR) [e](vbscript:x)",
    );
    expect(out).not.toMatch(/<a |<img /);
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl("mailto:help@example.com")).toBe(true);
    expect(isSafeUrl("/help/en/refunds")).toBe(true);
  });

  it("marks only links that leave the site as noopener nofollow ugc", () => {
    const out = renderMarkdown("[ext](https://example.com/a) [int](/help/en/b) [mail](mailto:a@example.com) //evil.example.com");
    expect(out).toContain('<a href="https://example.com/a" rel="noopener nofollow ugc">ext</a>');
    expect(out).toContain('<a href="/help/en/b">int</a>');
    expect(out).toContain('<a href="mailto:a@example.com">mail</a>');
    expect(renderMarkdown("[p](//evil.example.com/x)")).toContain('rel="noopener nofollow ugc"');
  });

  it("starts body headings at h2 (the title is the page's h1)", () => {
    expect(renderMarkdown("# One\n\n### Three")).toBe("<h2>One</h2>\n<h4>Three</h4>\n");
  });

  it("makes descriptions from the text only, cut on a word", () => {
    expect(plainText("## Hello\n\nSome **bold** and `code`.")).toBe("Hello Some bold and code.");
    const long = plainText("word ".repeat(100), 30);
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith("word…")).toBe(true);
  });
});

describe("help center slugs", () => {
  it("makes readable ASCII slugs from titles in any language", () => {
    expect(slugify("Comment être remboursé ?")).toBe("comment-etre-rembourse");
    expect(slugify("What's the refund policy?")).toBe("whats-the-refund-policy");
    expect(slugify("¿¡!!")).toBe("article");
    expect(slugify("Search")).toBe("search-article");
    expect(slugify("word ".repeat(40)).length).toBeLessThanOrEqual(80);
    expect(slugify("x".repeat(120))).toHaveLength(80);
    expect(isValidSlug("search")).toBe(false);
    expect(isValidSlug("ok-slug-2")).toBe(true);
    expect(isValidSlug("-bad")).toBe(false);
  });

  it("numbers duplicates and stays within the length limit", () => {
    expect(uniqueSlug("refunds", new Set())).toBe("refunds");
    expect(uniqueSlug("refunds", new Set(["refunds", "refunds-2"]))).toBe("refunds-3");
    const long = "a".repeat(80);
    expect(uniqueSlug(long, new Set([long]))).toBe(`${"a".repeat(78)}-2`);
  });

  it("backfills in creation order: per language, but an every-language item clashes with all", () => {
    const assigned = assignSlugs([
      { id: "1", title: "Refunds", locale: null, slug: null },
      { id: "2", title: "Refunds", locale: "en", slug: null },
      { id: "3", title: "Refunds", locale: "fr", slug: null },
      { id: "4", title: "Billing", locale: "en", slug: null },
      { id: "5", title: "Billing", locale: "fr", slug: null },
      { id: "6", title: "Kept", locale: "en", slug: "kept" },
      { id: "7", title: "Kept", locale: null, slug: null },
    ]);
    expect(Object.fromEntries(assigned)).toEqual({
      "1": "refunds",
      "2": "refunds-2",
      "3": "refunds-2",
      "4": "billing",
      "5": "billing",
      "7": "kept-2",
    });
  });
});

describe("help center language and search", () => {
  it("picks the supported language the browser prefers most", () => {
    expect(negotiateLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiateLocale("de-DE, en;q=0.5, fr;q=0.7")).toBe("fr");
    expect(negotiateLocale("en;q=0.2, fr;q=0.9")).toBe("fr");
    expect(negotiateLocale("fr;q=0, en;q=0.1")).toBe("en");
    expect(negotiateLocale("de, es")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });

  it("turns any visitor input into quoted words, never FTS syntax", () => {
    expect(helpSearchQuery('refund" OR * NEAR(a b) title:x ^y -z {col}')).toBe(
      '"refund"* OR "or"* OR "near"* OR "a"* OR "b"* OR "title"* OR "x"* OR "y"*',
    );
    expect(helpSearchQuery("Remboursé  remboursé")).toBe('"remboursé"*');
    expect(helpSearchQuery('*** "" ()')).toBeNull();
    expect(helpSearchQuery(`${"a ".repeat(150)}zzz`)).toBe('"a"*');
  });
});

describe("help center pages", () => {
  it("orders categories by their first position, then name, General last on a tie", () => {
    const groups = groupByCategory(
      [
        item({ id: "a", title: "Zeta", category: "Billing", position: 0 }),
        item({ id: "b", title: "Alpha", category: "Billing", position: 0 }),
        item({ id: "c", title: "Loose", category: null, position: 0 }),
        item({ id: "d", title: "Pinned", category: "Account", position: -5 }),
        item({ id: "e", title: "Late", category: " Billing ", position: 3 }),
        item({ id: "f", title: "Animals", category: "Zoo", position: 0 }),
      ],
      "en",
    );
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ["Account", ["d"]],
      ["Billing", ["b", "a", "e"]],
      ["Zoo", ["f"]],
      [null, ["c"]],
    ]);
  });

  it("links translations with hreflang only when another language exists", () => {
    const origin = "https://help.example.com";
    expect(articleAlternates(origin, item({ locale: "en" }), [])).toEqual([]);
    expect(articleAlternates(origin, item({ locale: null, slug: "all" }), []).map((a) => `${a.hreflang} ${a.href}`)).toEqual([
      "en https://help.example.com/help/en/all",
      "fr https://help.example.com/help/fr/all",
      "x-default https://help.example.com/help/en/all",
    ]);
    const fr = item({ id: "2", locale: "fr", slug: "remboursements", translation_group: "g" });
    const en = item({ id: "1", locale: "en", slug: "refunds", translation_group: "g" });
    expect(articleAlternates(origin, fr, [en]).map((a) => `${a.hreflang} ${a.href}`)).toEqual([
      "fr https://help.example.com/help/fr/remboursements",
      "en https://help.example.com/help/en/refunds",
      "x-default https://help.example.com/help/en/refunds",
    ]);
  });

  it("escapes what visitors and teams type into the page", () => {
    const strings = getHelpCenterStrings("en");
    const page = searchPage(
      {
        locale: "en",
        strings,
        origin: "https://help.example.com",
        teamName: '<img src=x onerror="alert(1)">',
        siteTitle: "Help",
        siteDescription: "Desc",
        chat: false,
        css: "body{}",
      },
      '"><script>alert(1)</script>',
      [item({ title: "<b>Title</b>", body: "<i>x</i>" })],
    ).value;
    expect(page).not.toMatch(/<script>alert|<img src=x|<b>Title|<i>x/);
    expect(page).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(page).not.toContain("/widget.js");
  });
});
