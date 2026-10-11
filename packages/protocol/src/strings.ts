import type { Locale, LocalizedText, ReplyTime } from "./types";

// User-facing copy for the web widget and the React Native SDK.
const en = {
  home: "Home",
  messages: "Messages",
  close: "Close",
  back: "Back",
  defaultGreeting: "Hi there 👋",
  defaultGreetingNamed: "Hi {name} 👋",
  defaultIntro: "How can we help?",
  sendUsAMessage: "Send us a message",
  newConversation: "New conversation",
  continueConversation: "Continue the conversation",
  recentMessage: "Recent message",
  noConversations: "No messages yet",
  noConversationsHint: "Questions? We're here to help.",
  online: "We're online",
  replyTime_minutes: "We typically reply in a few minutes",
  replyTime_hour: "We typically reply within an hour",
  replyTime_day: "We typically reply within a day",
  composerPlaceholder: "Write a message…",
  send: "Send",
  attach: "Attach a file",
  removeAttachment: "Remove attachment",
  dropToAttach: "Drop files to attach",
  uploading: "Uploading…",
  uploadFailed: "Upload failed",
  sendFailed: "Not sent. Tap to retry.",
  retry: "Retry",
  seen: "Seen",
  sent: "Sent",
  you: "You",
  typing: "{name} is typing…",
  someoneTyping: "Typing…",
  today: "Today",
  yesterday: "Yesterday",
  now: "now",
  minutesShort: "{n}m",
  hoursShort: "{n}h",
  daysShort: "{n}d",
  conversationResolved: "This conversation was marked as resolved",
  conversationReopened: "Conversation reopened",
  rateTitle: "How did we do?",
  rateBad: "Bad",
  rateOkay: "Okay",
  rateGreat: "Great",
  rateCommentPlaceholder: "Tell us more (optional)",
  rateSubmit: "Send feedback",
  rateThanks: "Thanks for your feedback!",
  emailPromptTitle: "Get notified by email",
  emailPromptBody: "We'll let you know when we reply.",
  emailPlaceholder: "you@example.com",
  emailSave: "Save",
  emailSaved: "We'll email you at {email}",
  fileTooLarge: "{name} is larger than {max}",
  fileTypeNotAllowed: "{name} can't be sent",
  tooManyFiles: "You can attach up to {n} files",
  connectionLost: "Reconnecting…",
  loadError: "Something went wrong. Please try again.",
  openImage: "Open image",
  download: "Download",
  team: "The team",
  takePhoto: "Take a photo",
  choosePhoto: "Choose a photo",
  chooseFile: "Choose a file",
  cancel: "Cancel",
  // Web messenger
  messengerTitle: "Messenger",
  openMessenger: "Open the messenger",
  closeMessenger: "Close the messenger",
  unreadBadge: "{n} unread messages",
  sending: "Sending…",
  newMessages: "New messages",
  youPrefix: "You: {body}",
  attachmentPreview: "Attachment",
  loadingOlder: "Loading earlier messages…",
  emailInvalid: "Enter a valid email address",
  signInToChat: "Sign in to chat with us",
  messageFrom: "{name}: {body}",
  conversationWith: "Conversation with {name}",
  // React Native SDK
  loading: "Loading…",
  seeAll: "See all",
  cameraAccessDenied: "Allow camera access in Settings to take a photo.",
  closeImage: "Close image",
  // AI assistant
  aiAssistant: "AI assistant",
  aiBadge: "AI",
  aiAuthor: "{name} · AI",
  aiAssistantIntro: "Our AI assistant answers right away; you can ask for a person anytime.",
  assistantReplying: "{name} is replying…",
  talkToHuman: "Talk to a human",
  talkToHumanHint: "Passes this conversation to a person on the team",
  talkToHumanPending: "Connecting you to the team…",
  talkToHumanFailed: "We couldn't reach the team. Please try again.",
  handedOff: "We've passed you to the team — a person will reply here.",
  // Help (FAQ)
  help: "Help",
  searchHelp: "Search for help",
  clearSearch: "Clear search",
  helpNoResults: "No answer found for \u201c{query}\u201d.",
  askUsInstead: "Ask us instead",
  stillNeedHelp: "Still need help?",
  stillNeedHelpHint: "Send us a message and we'll sort it out.",
  askAQuestion: "Ask a question",
};

export type SupportStrings = typeof en;

const fr: SupportStrings = {
  home: "Accueil",
  messages: "Messages",
  close: "Fermer",
  back: "Retour",
  defaultGreeting: "Bonjour 👋",
  defaultGreetingNamed: "Bonjour {name} 👋",
  defaultIntro: "Comment pouvons-nous vous aider ?",
  sendUsAMessage: "Envoyez-nous un message",
  newConversation: "Nouvelle conversation",
  continueConversation: "Reprendre la conversation",
  recentMessage: "Message récent",
  noConversations: "Aucun message pour l'instant",
  noConversationsHint: "Une question ? Nous sommes là pour vous aider.",
  online: "Nous sommes en ligne",
  replyTime_minutes: "Nous répondons généralement en quelques minutes",
  replyTime_hour: "Nous répondons généralement en moins d'une heure",
  replyTime_day: "Nous répondons généralement en moins d'un jour",
  composerPlaceholder: "Écrivez un message…",
  send: "Envoyer",
  attach: "Joindre un fichier",
  removeAttachment: "Retirer la pièce jointe",
  dropToAttach: "Déposez vos fichiers ici",
  uploading: "Envoi…",
  uploadFailed: "Échec de l'envoi",
  sendFailed: "Non envoyé. Touchez pour réessayer.",
  retry: "Réessayer",
  seen: "Vu",
  sent: "Envoyé",
  you: "Vous",
  typing: "{name} écrit…",
  someoneTyping: "En train d'écrire…",
  today: "Aujourd'hui",
  yesterday: "Hier",
  now: "maintenant",
  minutesShort: "{n} min",
  hoursShort: "{n} h",
  daysShort: "{n} j",
  conversationResolved: "Cette conversation a été marquée comme résolue",
  conversationReopened: "Conversation rouverte",
  rateTitle: "Comment s'est passé l'échange ?",
  rateBad: "Mauvais",
  rateOkay: "Correct",
  rateGreat: "Excellent",
  rateCommentPlaceholder: "Dites-nous en plus (facultatif)",
  rateSubmit: "Envoyer l'avis",
  rateThanks: "Merci pour votre avis !",
  emailPromptTitle: "Être prévenu par e-mail",
  emailPromptBody: "Nous vous préviendrons quand nous répondrons.",
  emailPlaceholder: "vous@exemple.com",
  emailSave: "Enregistrer",
  emailSaved: "Nous vous écrirons à {email}",
  fileTooLarge: "{name} dépasse {max}",
  fileTypeNotAllowed: "{name} ne peut pas être envoyé",
  tooManyFiles: "Vous pouvez joindre jusqu'à {n} fichiers",
  connectionLost: "Reconnexion…",
  loadError: "Une erreur est survenue. Veuillez réessayer.",
  openImage: "Ouvrir l'image",
  download: "Télécharger",
  team: "L'équipe",
  takePhoto: "Prendre une photo",
  choosePhoto: "Choisir une photo",
  chooseFile: "Choisir un fichier",
  cancel: "Annuler",
  // Web messenger
  messengerTitle: "Messagerie",
  openMessenger: "Ouvrir la messagerie",
  closeMessenger: "Fermer la messagerie",
  unreadBadge: "{n} messages non lus",
  sending: "Envoi…",
  newMessages: "Nouveaux messages",
  youPrefix: "Vous : {body}",
  attachmentPreview: "Pièce jointe",
  loadingOlder: "Chargement des messages précédents…",
  emailInvalid: "Saisissez une adresse e-mail valide",
  signInToChat: "Connectez-vous pour discuter avec nous",
  messageFrom: "{name} : {body}",
  conversationWith: "Conversation avec {name}",
  // React Native SDK
  loading: "Chargement…",
  seeAll: "Tout voir",
  cameraAccessDenied: "Autorisez l'accès à l'appareil photo dans Réglages pour prendre une photo.",
  closeImage: "Fermer l'image",
  // AI assistant
  aiAssistant: "Assistant IA",
  aiBadge: "IA",
  aiAuthor: "{name} · IA",
  aiAssistantIntro: "Notre assistant IA répond tout de suite ; vous pouvez demander une personne à tout moment.",
  assistantReplying: "{name} répond…",
  talkToHuman: "Parler à une personne",
  talkToHumanHint: "Transmet cette conversation à une personne de l'équipe",
  talkToHumanPending: "Mise en relation avec l'équipe…",
  talkToHumanFailed: "Impossible de joindre l'équipe. Veuillez réessayer.",
  handedOff: "Nous vous avons transmis à l'équipe — une personne vous répondra ici.",
  // Aide (FAQ)
  help: "Aide",
  searchHelp: "Rechercher dans l'aide",
  clearSearch: "Effacer la recherche",
  helpNoResults: "Aucune réponse trouvée pour « {query} ».",
  askUsInstead: "Posez-nous la question",
  stillNeedHelp: "Besoin d'aide supplémentaire ?",
  stillNeedHelpHint: "Envoyez-nous un message, on s'en occupe.",
  askAQuestion: "Poser une question",
};

const dictionaries: Record<Locale, SupportStrings> = { en, fr };

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "fr"];

export function resolveLocale(input: string | null | undefined): Locale {
  const base = (input ?? "").toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? "") ? (base as Locale) : "en";
}

export function getStrings(locale: Locale): SupportStrings {
  return dictionaries[locale];
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function pickLocalized(text: LocalizedText, locale: Locale): string | null {
  return text[locale]?.trim() || text.en?.trim() || null;
}

export function replyTimeLabel(strings: SupportStrings, replyTime: ReplyTime): string {
  return strings[`replyTime_${replyTime}`];
}

/** "now", "5m", "3h", "2d", then a short date. */
export function formatRelative(strings: SupportStrings, at: number, now = Date.now(), locale: Locale = "en"): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return strings.now;
  if (minutes < 60) return format(strings.minutesShort, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format(strings.hoursShort, { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return format(strings.daysShort, { n: days });
  return new Date(at).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function formatDayLabel(strings: SupportStrings, at: number, now = Date.now(), locale: Locale = "en"): string {
  const day = startOfDay(at);
  const today = startOfDay(now);
  if (day === today) return strings.today;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === startOfDay(yesterday.getTime())) return strings.yesterday;
  return new Date(at).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

export function formatClock(at: number, locale: Locale = "en"): string {
  return new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
