import type { AssistantReportStats, SatisfactionStats } from "yunidesk";

/** One group of conversations the assistant took part in, as the summary query counts them. */
export interface AssistantGroup {
  resolved: number;
  human_replied: number;
  ai_state: string | null;
  n: number;
}

export type AssistantOutcome = "resolved" | "handed_off" | "other";

/**
 * - handed off: it passed the conversation to the team (the customer asked, or a limit or an error stopped it);
 * - resolved: resolved and no person on the team ever replied (whoever clicked Resolve);
 * - other: a teammate stepped in, or it is still going.
 */
export function assistantOutcome(group: Pick<AssistantGroup, "resolved" | "human_replied" | "ai_state">): AssistantOutcome {
  if (group.ai_state === "handed_off") return "handed_off";
  if (group.resolved === 1 && group.human_replied === 0) return "resolved";
  return "other";
}

export function assistantStats(groups: readonly AssistantGroup[]): AssistantReportStats {
  let involved = 0;
  let resolved = 0;
  let handedOff = 0;
  for (const group of groups) {
    involved += group.n;
    const outcome = assistantOutcome(group);
    if (outcome === "resolved") resolved += group.n;
    else if (outcome === "handed_off") handedOff += group.n;
  }
  return { involved, resolved, handedOff, resolutionRate: involved ? resolved / involved : null };
}

/** rating_score 3 = Great, 2 = Okay, 1 = Bad. */
export function satisfactionStats(groups: readonly { score: number; n: number }[]): SatisfactionStats {
  const count = (score: number) => groups.filter((g) => g.score === score).reduce((sum, g) => sum + g.n, 0);
  const great = count(3);
  const okay = count(2);
  const bad = count(1);
  const rated = great + okay + bad;
  return { rated, great, okay, bad, csat: rated ? great / rated : null };
}
