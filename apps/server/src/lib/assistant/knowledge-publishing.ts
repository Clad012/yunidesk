import type { Locale } from "yunidesk";
import type { Env } from "../../env";
import { slugify, takenSlugs, uniqueSlug } from "../../help-center/slug";
import { badRequest, conflict } from "../errors";
import type { KnowledgeRow } from "./knowledge";

/**
 * The slug an item gets: the one asked for (refused if another item already uses it where this one
 * is listed), or one made from the title. An item moving to another language keeps its slug unless
 * it clashes there.
 */
export async function resolveSlug(
  env: Env,
  input: { id: string | null; title: string; locale: Locale | null; requested: string | undefined; current: string | null },
): Promise<string> {
  const taken = await takenSlugs(env, input.locale, input.id);
  if (input.requested !== undefined) {
    if (taken.has(input.requested)) throw conflict("Another item already uses this address in this language");
    return input.requested;
  }
  if (input.current) return taken.has(input.current) ? uniqueSlug(input.current, taken) : input.current;
  return uniqueSlug(slugify(input.title), taken);
}

/**
 * The translation group after linking an item to `translationOf` (or unlinking it with null).
 * Both need a language, different ones, and the group may hold one item per language. Returns the
 * group and the target's id when the target has no group yet (it takes its own id as the group).
 */
export async function resolveTranslationGroup(
  env: Env,
  input: { id: string; locale: Locale | null; translationOf: string | null | undefined; current: string | null },
): Promise<{ group: string | null; seedTarget: string | null }> {
  if (input.translationOf === undefined) {
    // Without a language, or with the language of another item in its group, the link no longer holds.
    if (!input.current || !input.locale) return { group: null, seedTarget: null };
    const clash = await sameLanguageInGroup(env, input.current, input.locale, input.id);
    return { group: clash ? null : input.current, seedTarget: null };
  }
  if (input.translationOf === null) return { group: null, seedTarget: null };
  if (input.translationOf === input.id) throw badRequest("An item can't be its own translation");
  const target = await env.DB.prepare("SELECT id, locale, translation_group FROM knowledge_items WHERE id = ?")
    .bind(input.translationOf)
    .first<Pick<KnowledgeRow, "id" | "locale" | "translation_group">>();
  if (!target) throw badRequest("The item to link as a translation doesn't exist");
  if (!input.locale || !target.locale) throw badRequest("Pick a language for both items before linking them as translations");
  if (input.locale === target.locale) throw badRequest("A translation must be in another language");
  const group = target.translation_group ?? target.id;
  if (await sameLanguageInGroup(env, group, input.locale, input.id)) throw conflict("That item already has a translation in this language");
  return { group, seedTarget: target.translation_group ? null : target.id };
}

async function sameLanguageInGroup(env: Env, group: string, locale: Locale, exceptId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 FROM knowledge_items WHERE translation_group = ? AND locale = ? AND id != ? LIMIT 1")
    .bind(group, locale, exceptId)
    .first();
  return row !== null;
}

/** D1 reports the per-language unique index as a constraint error; the caller sees a 409. */
export function isSlugConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
