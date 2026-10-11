import type { AssistantSettings, AssistantSettingsPatch } from "yunidesk";
import { copy } from "@/lib/copy";

export const MIN_DAILY_BUDGET_USD = 0.5;
const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/;

/** The draft fields that differ from what the server has. */
export function changedFields(saved: AssistantSettings, draft: AssistantSettingsPatch): AssistantSettingsPatch {
  const changes: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(draft)) {
    if (next !== saved[key as keyof AssistantSettings]) changes[key] = next;
  }
  return changes as AssistantSettingsPatch;
}

export interface AssistantFormErrors {
  name: string | null;
  model: string | null;
  dailyBudgetUsd: string | null;
}

export function assistantFormErrors(value: AssistantSettings): AssistantFormErrors {
  const budget = value.dailyBudgetUsd;
  return {
    name: value.name.trim() ? null : copy.assistant.nameRequired,
    model: MODEL_ID.test(value.model.trim()) ? null : copy.assistant.modelInvalid,
    dailyBudgetUsd: Number.isFinite(budget) && budget >= MIN_DAILY_BUDGET_USD ? null : copy.assistant.budgetHint,
  };
}
