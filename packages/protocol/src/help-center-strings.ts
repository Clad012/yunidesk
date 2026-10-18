import type { Locale } from "./types";

// Copy of the public help center pages (/help), rendered by the server.
const en = {
  defaultTitle: "{team} Help Center",
  defaultDescription: "Answers to common questions from the {team} team.",
  home: "Help Center",
  skipToContent: "Skip to content",
  searchLabel: "Search the help center",
  searchPlaceholder: "Search for answers…",
  searchButton: "Search",
  searchTitle: "Search results",
  searchResultsFor: "Results for “{query}”",
  searchNoResults: "No articles match “{query}”.",
  searchEmpty: "Type a few words to search.",
  searchTryAgain: "Try other words, or browse the topics below.",
  general: "General",
  articleCount_one: "{n} article",
  articleCount_other: "{n} articles",
  recentlyUpdated: "Recently updated",
  updatedOn: "Updated {date}",
  breadcrumb: "Breadcrumb",
  relatedInCategory: "More in {category}",
  noArticles: "No articles yet.",
  stillNeedHelp: "Still need help?",
  stillNeedHelpHint: "Our team is here for you.",
  chatWithUs: "Chat with us",
  language: "Language",
  notFoundTitle: "Page not found",
  notFoundBody: "This article doesn't exist or is no longer published.",
  backToHome: "Back to the help center",
};

export type HelpCenterStrings = typeof en;

const fr: HelpCenterStrings = {
  defaultTitle: "Centre d'aide {team}",
  defaultDescription: "Les réponses aux questions fréquentes, par l'équipe {team}.",
  home: "Centre d'aide",
  skipToContent: "Aller au contenu",
  searchLabel: "Rechercher dans le centre d'aide",
  searchPlaceholder: "Rechercher une réponse…",
  searchButton: "Rechercher",
  searchTitle: "Résultats de recherche",
  searchResultsFor: "Résultats pour « {query} »",
  searchNoResults: "Aucun article ne correspond à « {query} ».",
  searchEmpty: "Saisissez quelques mots pour rechercher.",
  searchTryAgain: "Essayez d'autres mots, ou parcourez les rubriques ci-dessous.",
  general: "Général",
  articleCount_one: "{n} article",
  articleCount_other: "{n} articles",
  recentlyUpdated: "Mis à jour récemment",
  updatedOn: "Mis à jour le {date}",
  breadcrumb: "Fil d'Ariane",
  relatedInCategory: "Autres articles : {category}",
  noArticles: "Aucun article pour le moment.",
  stillNeedHelp: "Besoin d'aide supplémentaire ?",
  stillNeedHelpHint: "Notre équipe est là pour vous.",
  chatWithUs: "Discuter avec nous",
  language: "Langue",
  notFoundTitle: "Page introuvable",
  notFoundBody: "Cet article n'existe pas ou n'est plus publié.",
  backToHome: "Retour au centre d'aide",
};

const dictionaries: Record<Locale, HelpCenterStrings> = { en, fr };

/** Each language's name in that language, for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français" };

export function getHelpCenterStrings(locale: Locale): HelpCenterStrings {
  return dictionaries[locale];
}
