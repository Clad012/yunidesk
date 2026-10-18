import type { KnowledgeItem } from "yunidesk";
import { useBootstrap } from "@/hooks/use-bootstrap";

/** The help center lives on this same server, under /help. */
export function helpCenterBaseUrl(): string {
  return `${window.location.origin}/help`;
}

/** The public page of a knowledge item, or null when it isn't shown (help center off, or not published). */
export function useHelpCenterLink(item: Pick<KnowledgeItem, "published" | "slug" | "locale"> | null): string | null {
  const enabled = useBootstrap().settings.helpCenter?.enabled ?? false;
  if (!enabled || !item?.published) return null;
  return `${helpCenterBaseUrl()}/${item.locale ?? "en"}/${encodeURIComponent(item.slug)}`;
}
