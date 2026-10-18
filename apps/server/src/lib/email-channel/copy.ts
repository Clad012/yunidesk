import type { Locale } from "yunidesk";
import type { MailHeader } from "./auth-results";

// What our emails say to customers, in their language.

export const EMAIL_COPY: Record<Locale, { footer: string; attachments: string; noSubject: string; testSubject: string; testBody: string }> = {
  en: {
    footer: "{team} · Reply to this email to continue the conversation.",
    attachments: "Attachments (links valid for 30 days):",
    noSubject: "Your message to {team}",
    testSubject: "Test email from {team}",
    testBody: "This is a test email from the {team} support desk. Replies are sent like this one.",
  },
  fr: {
    footer: "{team} · Répondez à cet e-mail pour continuer la conversation.",
    attachments: "Pièces jointes (liens valables 30 jours) :",
    noSubject: "Votre message à {team}",
    testSubject: "E-mail de test de {team}",
    testBody: "Ceci est un e-mail de test du support {team}. Les réponses sont envoyées comme celui-ci.",
  },
};

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

const FRENCH = /\b(bonjour|merci|je|vous|est|pas|avec|pour|une|cordialement|madame|monsieur|svp|mon|ma|mes|nous|sur|dans)\b/gi;
const ENGLISH = /\b(hello|hi|thanks|thank|the|you|is|not|with|for|please|regards|my|we|on|in|and)\b/gi;

/** The customer's language: Content-Language when they sent one, else a word count on what they wrote. */
export function detectLocale(headers: readonly MailHeader[], text: string): Locale {
  const declared = headers.find((h) => h.key === "content-language")?.value.trim().toLowerCase();
  if (declared?.startsWith("fr")) return "fr";
  if (declared?.startsWith("en")) return "en";
  const sample = text.slice(0, 2000);
  const fr = sample.match(FRENCH)?.length ?? 0;
  const en = sample.match(ENGLISH)?.length ?? 0;
  return fr > en ? "fr" : "en";
}
