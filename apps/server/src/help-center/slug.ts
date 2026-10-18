import type { Locale } from "yunidesk";
import type { Env } from "../env";

export const MAX_SLUG_LENGTH = 80;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths under /help/<locale>/ that are pages, not articles. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["search"]);

/** "Comment être remboursé ?" → "comment-etre-rembourse". Never empty, never reserved. */
export function slugify(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG_LENGTH) break;
    slug = next;
  }
  // A first word longer than the limit is cut rather than dropped.
  if (!slug && words[0]) slug = words[0].slice(0, MAX_SLUG_LENGTH);
  if (!slug) return "article";
  return RESERVED_SLUGS.has(slug) ? `${slug}-article` : slug;
}

/** `base`, or `base-2`, `base-3`… — the first one not in `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

/**
 * Whether two items would share an address: same language, or either one is for every language
 * (it is listed under each language, so its slug must be free in all of them).
 */
export function slugsClash(a: Locale | null, b: Locale | null): boolean {
  return a === null || b === null || a === b;
}

interface SlugRow {
  id: string;
  title: string;
  locale: Locale | null;
  slug: string | null;
}

/**
 * Slugs for the rows that have none, in the order given (creation order), each unique against
 * every slug it would clash with. Same rows in → same slugs out.
 */
export function assignSlugs(rows: readonly SlugRow[]): Map<string, string> {
  const placed: { locale: Locale | null; slug: string }[] = rows.flatMap((row) => (row.slug ? [{ locale: row.locale, slug: row.slug }] : []));
  const assigned = new Map<string, string>();
  for (const row of rows) {
    if (row.slug) continue;
    const taken = new Set(placed.filter((p) => slugsClash(p.locale, row.locale)).map((p) => p.slug));
    const slug = uniqueSlug(slugify(row.title), taken);
    placed.push({ locale: row.locale, slug });
    assigned.set(row.id, slug);
  }
  return assigned;
}

/** Slugs another item already uses where an item in `locale` would be listed. */
export async function takenSlugs(env: Env, locale: Locale | null, exceptId: string | null): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT slug FROM knowledge_items
     WHERE slug IS NOT NULL AND id != ? AND (? IS NULL OR locale IS NULL OR locale = ?)`,
  )
    .bind(exceptId ?? "", locale, locale)
    .all<{ slug: string }>();
  return new Set(results.map((r) => r.slug));
}

let filled = false;

/**
 * Gives every knowledge item created before the help center its slug, once per isolate. Runs in
 * creation order, so two isolates doing it at once write the same values.
 */
export async function ensureSlugs(env: Env): Promise<void> {
  if (filled) return;
  const missing = await env.DB.prepare("SELECT 1 FROM knowledge_items WHERE slug IS NULL LIMIT 1").first();
  if (missing) {
    const { results } = await env.DB.prepare(
      "SELECT id, title, locale, slug FROM knowledge_items ORDER BY created_at, rowid",
    ).all<SlugRow>();
    const assigned = assignSlugs(results);
    const statements = [...assigned].map(([id, slug]) =>
      env.DB.prepare("UPDATE knowledge_items SET slug = ? WHERE id = ? AND slug IS NULL").bind(slug, id),
    );
    for (let i = 0; i < statements.length; i += 50) {
      try {
        await env.DB.batch(statements.slice(i, i + 50));
      } catch (error) {
        // Another isolate filled them first; the next request checks again.
        console.warn("slug backfill", error);
        return;
      }
    }
  }
  filled = true;
}
