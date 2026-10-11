import type { HelpArticle, KnowledgeItem } from "yunidesk";
import type { Env } from "../../env";
import { ftsQuery } from "../../routes/agent/inbox";

export interface KnowledgeRow {
  id: string;
  kind: "faq" | "article";
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

/** How much knowledge one reply may carry, in characters. */
const MAX_CONTEXT_CHARS = 8000;
const MAX_ITEM_CHARS = 3000;
const MAX_MATCHES = 6;

export function toKnowledgeItem(row: KnowledgeRow): KnowledgeItem {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

/**
 * The knowledge that best matches a question: full-text search (title weighted over body), any
 * word may match, best first. Cut to a budget so a large knowledge base never floods the prompt.
 */
/** Most FAQ entries the messenger receives; search runs on the device over this list. */
const MAX_HELP_ARTICLES = 100;

/** The FAQ entries customers see in the messenger, in the order they were added. Articles stay private. */
export async function listHelpArticles(env: Env): Promise<HelpArticle[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, title, body, updated_at FROM knowledge_items WHERE kind = 'faq' ORDER BY created_at, rowid LIMIT ?",
  )
    .bind(MAX_HELP_ARTICLES)
    .all<Pick<KnowledgeRow, "id" | "title" | "body" | "updated_at">>();
  return results.map((row) => ({ id: row.id, title: row.title, body: row.body, updatedAt: row.updated_at }));
}

export async function searchKnowledge(env: Env, question: string): Promise<KnowledgeRow[]> {
  const words = ftsQuery(question);
  if (!words) return [];
  // ftsQuery requires every word; a question ("how do I reset my password?") matches better on any.
  const anyWord = words.split(" ").join(" OR ");
  const { results } = await env.DB.prepare(
    `SELECT k.* FROM knowledge_fts f JOIN knowledge_items k ON k.rowid = f.rowid
     WHERE knowledge_fts MATCH ? ORDER BY bm25(knowledge_fts, 5.0, 1.0) LIMIT ?`,
  )
    .bind(anyWord, MAX_MATCHES)
    .all<KnowledgeRow>();
  return fitBudget(results);
}

export function fitBudget(rows: KnowledgeRow[]): KnowledgeRow[] {
  const out: KnowledgeRow[] = [];
  let used = 0;
  for (const row of rows) {
    const body = row.body.length > MAX_ITEM_CHARS ? `${row.body.slice(0, MAX_ITEM_CHARS)}…` : row.body;
    const size = row.title.length + body.length;
    if (used + size > MAX_CONTEXT_CHARS) break;
    out.push({ ...row, body });
    used += size;
  }
  return out;
}

/** The knowledge as the model reads it: numbered, each with its kind and title. */
export function renderKnowledge(rows: KnowledgeRow[]): string {
  if (rows.length === 0) return "No matching knowledge was found for this question.";
  return rows
    .map((row, index) => `[${index + 1}] ${row.kind === "faq" ? "FAQ" : "Article"}: ${row.title}\n${row.body}`)
    .join("\n\n");
}
