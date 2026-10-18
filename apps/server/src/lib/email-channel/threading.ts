// Which conversation an inbound email continues. In order:
// 1. it was sent to the conversation's signed reply+ address;
// 2. its In-Reply-To / References name an email of the conversation.
// Either way it only joins when it comes from the conversation's customer, and an unverified
// sender (no DMARC / aligned DKIM pass) may only continue through the unguessable reply address,
// never into a contact your app identified. Anything else starts a new conversation.

export interface ThreadCandidate {
  conversationId: string;
  via: "token" | "headers";
  contact: { email: string | null; external_id: string | null };
}

export function acceptsThread(candidate: ThreadCandidate, sender: string, verified: boolean): boolean {
  if (!candidate.contact.email || candidate.contact.email.trim().toLowerCase() !== sender) return false;
  if (verified) return true;
  return candidate.via === "token" && candidate.contact.external_id === null;
}

/** Message-IDs to look up, most specific first: In-Reply-To, then References newest to oldest. */
export function threadLookupIds(inReplyTo: readonly string[], references: readonly string[]): string[] {
  return [...new Set([...inReplyTo, ...[...references].reverse()])].slice(0, 40);
}
