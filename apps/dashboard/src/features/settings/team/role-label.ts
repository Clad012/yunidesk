import type { AgentRole } from "yunidesk";
import { copy } from "@/lib/copy";

export const roleLabel = (role: AgentRole): string => copy.roles[role];
export const roleHint = (role: AgentRole): string => copy.roles[`hint_${role}`];
