import { createContext, useContext } from "react";
import type { Locale, SupportStrings } from "yunidesk";
import type { Actions } from "./useActions";
import type { MessengerData } from "./useMessengerData";

export type Tab = "home" | "messages";

/**
 * `key` stays the same when a new conversation gets its real id, so the screen is not remounted.
 * `from` is the tab the back button returns to.
 */
export type Route =
  | { name: Tab }
  | { name: "conversation"; id: string | null; key: string; from: Tab };

let routeSeq = 0;
export function conversationRoute(id: string | null, from: Tab): Route {
  routeSeq += 1;
  return { name: "conversation", id, key: `${id ?? "new"}:${routeSeq}`, from };
}

export interface MessengerContextValue {
  strings: SupportStrings;
  locale: Locale;
  data: MessengerData;
  actions: Actions;
  route: Route;
  navigate: (route: Route) => void;
  /** Full-screen layout (small viewport, or the standalone page). */
  mobile: boolean;
  /** No launcher to close the panel with, so headers show a close button. */
  showCloseButton: boolean;
  panelOpen: boolean;
  closePanel: () => void;
  /** Text handed over by showNewMessage(text); `nonce` changes on every call. */
  prefill: { text: string; nonce: number } | null;
  announce: (text: string) => void;
}

export const MessengerContext = createContext<MessengerContextValue | null>(null);

export function useMessenger(): MessengerContextValue {
  const value = useContext(MessengerContext);
  if (!value) throw new Error("useMessenger outside MessengerContext");
  return value;
}
