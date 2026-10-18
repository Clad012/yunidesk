import type { AssignmentConditions, AssignmentRuleInput, Tag } from "yunidesk";
import { copy, fmt } from "@/lib/copy";

/** "Mobile app · Signed-in users · Billing · plan = pro", or "Every conversation". */
export function describeConditions(conditions: AssignmentConditions, tags: readonly Pick<Tag, "id" | "name">[]): string {
  const parts: string[] = [];
  if (conditions.channel !== "any") parts.push(copy.assignment[`channel_${conditions.channel}`]);
  if (conditions.language !== "any") parts.push(copy.assignment[`language_${conditions.language}`]);
  if (conditions.contact !== "any") parts.push(copy.assignment[`contact_${conditions.contact}`]);
  if (conditions.tagId) parts.push(tags.find((t) => t.id === conditions.tagId)?.name ?? copy.assignment.deletedTag);
  if (conditions.attribute) parts.push(`${conditions.attribute.key} = ${conditions.attribute.value}`);
  return parts.length ? parts.join(" · ") : copy.assignment.summaryAnything;
}

export function describeAction(rule: Pick<AssignmentRuleInput, "teamId" | "assign">, teams: readonly { id: string; name: string }[]): string {
  const team = teams.find((t) => t.id === rule.teamId)?.name ?? copy.assignment.unknownTeam;
  return fmt(copy.assignment.summaryTo, { team, assign: copy.assignment[`assign_${rule.assign}`] });
}

export const EMPTY_CONDITIONS: AssignmentConditions = { channel: "any", language: "any", contact: "any", tagId: null, attribute: null };
