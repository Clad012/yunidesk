import { Emitter } from "@/lib/realtime/emitter";
import type { ComposerMode } from "./use-send-message";

/** Lets shortcuts (r, n) focus the composer in a given mode. */
export const composerBus = new Emitter<{ focus: ComposerMode }>();

/** Unsent drafts per conversation, kept while the tab lives. */
export const drafts = new Map<string, { text: string; note: string }>();
