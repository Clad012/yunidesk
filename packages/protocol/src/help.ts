import type { HelpArticle } from "./types";

/** How many FAQ entries the messenger home lists before anything is typed. */
export const HELP_HOME_COUNT = 5;

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * FAQ entries matching what the customer typed, best first. Every word must appear in the title or
 * the answer (accents and case ignored, so "remboursement" finds "Remboursement"); matches in the
 * title rank above matches only in the answer. An empty query returns the list as it is.
 */
export function searchHelp(items: readonly HelpArticle[], query: string): HelpArticle[] {
  const terms = words(query);
  if (!terms.length) return [...items];
  const scored: { item: HelpArticle; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const title = fold(item.title);
    const body = fold(item.body);
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      else if (body.includes(term)) score += 1;
      else return;
    }
    scored.push({ item, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.item);
}
