import type { Locale } from "yunidesk";

/** `/help/<locale>` or `/help/<locale>/<slug>`, absolute when `origin` is given. */
export function helpCenterUrl(origin: string, locale: Locale, slug?: string): string {
  return `${origin}/help/${locale}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
}
