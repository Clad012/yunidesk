import type { Locale } from "yunidesk";
import type { Env } from "../env";
import { parseSettings, type StoredSettings } from "../lib/settings";

/** A published knowledge item as the help center shows it. */
export interface HelpItem {
  id: string;
  title: string;
  body: string;
  locale: Locale | null;
  slug: string;
  category: string | null;
  position: number;
  translation_group: string | null;
  updated_at: number;
}

const COLUMNS = "k.id, k.title, k.body, k.locale, k.slug, k.category, k.position, k.translation_group, k.updated_at";
/** Most articles one page lists. */
const MAX_LISTED = 500;
const MAX_RESULTS = 30;
export const MAX_QUERY_LENGTH = 200;
const MAX_QUERY_WORDS = 8;

export interface HelpCenterState {
  settings: StoredSettings;
  /** Changes whenever the settings or any knowledge item change (ETag). */
  version: string;
}

/** Settings read fresh (not the 15 s cache) together with the knowledge's version, in one round trip. */
export async function loadState(env: Env): Promise<HelpCenterState> {
  const [settingsResult, statsResult] = await env.DB.batch([
    env.DB.prepare("SELECT value, updated_at FROM settings WHERE key = 'workspace'"),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS at FROM knowledge_items"),
  ]);
  const settingsRow = (settingsResult?.results[0] ?? null) as { value: string; updated_at: number } | null;
  const stats = (statsResult?.results[0] ?? { n: 0, at: 0 }) as { n: number; at: number };
  return {
    settings: parseSettings(settingsRow?.value ?? null),
    version: `${settingsRow?.updated_at ?? 0}.${stats.n}.${stats.at}`,
  };
}

const IN_LOCALE = "k.published = 1 AND k.slug IS NOT NULL AND (k.locale IS NULL OR k.locale = ?)";

export async function listPublished(env: Env, locale: Locale): Promise<HelpItem[]> {
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM knowledge_items k WHERE ${IN_LOCALE} ORDER BY k.position, k.title LIMIT ?`)
    .bind(locale, MAX_LISTED)
    .all<HelpItem>();
  return results;
}

export async function findPublished(env: Env, locale: Locale, slug: string): Promise<HelpItem | null> {
  return env.DB.prepare(`SELECT ${COLUMNS} FROM knowledge_items k WHERE ${IN_LOCALE} AND k.slug = ? LIMIT 1`)
    .bind(locale, slug)
    .first<HelpItem>();
}

/** The published translations of an item (same translation group, another language). */
export async function publishedTranslations(env: Env, item: HelpItem): Promise<HelpItem[]> {
  if (!item.translation_group || !item.locale) return [];
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM knowledge_items k
     WHERE k.translation_group = ? AND k.id != ? AND k.published = 1 AND k.slug IS NOT NULL AND k.locale IS NOT NULL AND k.locale != ?`,
  )
    .bind(item.translation_group, item.id, item.locale)
    .all<HelpItem>();
  return results;
}

/** Every published page, for the sitemap. */
export async function listAllPublished(env: Env): Promise<Pick<HelpItem, "locale" | "slug" | "updated_at">[]> {
  const { results } = await env.DB.prepare(
    "SELECT locale, slug, updated_at FROM knowledge_items WHERE published = 1 AND slug IS NOT NULL ORDER BY created_at, rowid LIMIT 5000",
  ).all<Pick<HelpItem, "locale" | "slug" | "updated_at">>();
  return results;
}

/**
 * A visitor's search as an FTS5 query: only letters and digits survive (every FTS operator, quote
 * and column filter is dropped), each word is a quoted prefix, any word may match.
 */
export function helpSearchQuery(input: string): string | null {
  const words = input.slice(0, MAX_QUERY_LENGTH).match(/[\p{L}\p{N}]+/gu) ?? [];
  const unique = [...new Set(words.map((w) => w.toLowerCase().slice(0, 40)))].slice(0, MAX_QUERY_WORDS);
  return unique.length ? unique.map((w) => `"${w}"*`).join(" OR ") : null;
}

export async function searchPublished(env: Env, locale: Locale, input: string): Promise<HelpItem[]> {
  const match = helpSearchQuery(input);
  if (!match) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM knowledge_fts f JOIN knowledge_items k ON k.rowid = f.rowid
       WHERE knowledge_fts MATCH ? AND ${IN_LOCALE} ORDER BY bm25(knowledge_fts, 5.0, 1.0) LIMIT ?`,
    )
      .bind(match, locale, MAX_RESULTS)
      .all<HelpItem>();
    return results;
  } catch (error) {
    console.warn("help center search failed", error);
    return [];
  }
}

export interface HelpCategory {
  name: string | null;
  items: HelpItem[];
}

/**
 * Items grouped by category. Inside a category: position, then title. Categories: the one holding
 * the lowest position first, then by name; uncategorised items ("General") come last on a tie.
 */
export function groupByCategory(items: readonly HelpItem[], locale: Locale): HelpCategory[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const groups = new Map<string | null, HelpItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || null;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const byPosition = (a: HelpItem, b: HelpItem) => a.position - b.position || collator.compare(a.title, b.title);
  const categories = [...groups].map(([name, list]) => ({ name, items: list.sort(byPosition) }));
  return categories.sort((a, b) => {
    const first = a.items[0]!.position - b.items[0]!.position;
    if (first) return first;
    if (a.name === null) return b.name === null ? 0 : 1;
    if (b.name === null) return -1;
    return collator.compare(a.name, b.name);
  });
}

/** Other published articles in the same category (same language or every language). */
export async function listRelated(env: Env, locale: Locale, item: HelpItem, count: number): Promise<HelpItem[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM knowledge_items k
     WHERE ${IN_LOCALE} AND COALESCE(TRIM(k.category), '') = ? AND k.id != ? ORDER BY k.position, k.title LIMIT ?`,
  )
    .bind(locale, item.category?.trim() ?? "", item.id, count)
    .all<HelpItem>();
  return results;
}
