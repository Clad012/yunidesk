import type { Contact, MessagePreview } from "yunidesk";
import { copy, fmt } from "@/lib/copy";

export function contactLabel(contact: Pick<Contact, "name" | "email">): string {
  return contact.name || contact.email || copy.common.visitor;
}

/** List preview: "You: …" for my messages, "Ana: …" for a teammate's, attachments as a count. */
export function previewText(preview: MessagePreview | null, meName: string): { prefix: string; text: string } {
  if (!preview) return { prefix: "", text: "" };
  let prefix = "";
  if (preview.authorType === "agent") {
    prefix = preview.authorName && preview.authorName !== meName ? fmt(copy.list.teammatePrefix, { name: preview.authorName }) : copy.list.youPrefix;
  }
  const text =
    preview.body.trim() ||
    (preview.attachmentCount === 1 ? copy.list.attachment : preview.attachmentCount > 1 ? fmt(copy.list.attachments, { n: preview.attachmentCount }) : "");
  return { prefix, text };
}
