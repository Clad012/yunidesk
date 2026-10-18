import { SUPPORTED_LOCALES, type Locale } from "yunidesk";

export function parseLocale(value: string | undefined): Locale | null {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : null;
}

/** The supported language the browser prefers most (Accept-Language with q-values); English otherwise. */
export function negotiateLocale(header: string | null | undefined): Locale {
  let best: { locale: Locale; q: number; index: number } | null = null;
  (header ?? "")
    .split(",")
    .slice(0, 20)
    .forEach((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const locale = parseLocale(tag.trim().toLowerCase().split("-")[0]);
      if (!locale) return;
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      if (!Number.isFinite(q) || q <= 0) return;
      if (!best || q > best.q) best = { locale, q, index };
    });
  return (best as { locale: Locale } | null)?.locale ?? "en";
}
