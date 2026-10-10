import type { AttachmentPicker } from "../composer/attachment-picker";
import { createContext, useContext, type Dispatch } from "react";
import type { ConnectionState, SupportClient } from "yunidesk/client";
import type {
  ContactProfile,
  Locale,
  MessengerAction,
  MessengerState,
  SupportStrings,
  WidgetConfig,
} from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";

/** Where the messenger opens: the home screen, the conversation list, a new conversation, or one conversation. */
export type MessengerRoute = "home" | "messages" | "new" | { conversationId: string };

export type ResetAction = { type: "reset" };

export interface SupportCore {
  client: SupportClient;
  /** Null when attachments are off or no picker is available. */
  attachmentPicker: AttachmentPicker | null;
  locale: Locale;
  strings: SupportStrings;
  theme: ResolvedTheme;
  /** Server settings and team; null until the first bootstrap succeeds. */
  config: WidgetConfig | null;
  contact: ContactProfile | null;
  ready: boolean;
  /** The last bootstrap failed; `refresh()` retries. */
  failed: boolean;
  connection: ConnectionState;
  /** Bumps after the socket comes back, so open screens refetch. */
  syncTick: number;
  appActive: boolean;
  dispatch: Dispatch<MessengerAction | ResetAction>;
  /** Starts the session and realtime if they are not running yet (messenger screens call it on mount). */
  activate: () => void;
  refresh: () => Promise<void>;
  open: (route?: MessengerRoute) => void;
  close: () => void;
}

export const SupportCoreContext = createContext<SupportCore | null>(null);
export const SupportStateContext = createContext<MessengerState | null>(null);

export function useSupportCore(): SupportCore {
  const core = useContext(SupportCoreContext);
  if (!core) throw new Error("Yunidesk components must be rendered inside <SupportProvider>.");
  return core;
}

export function useMessengerState(): MessengerState {
  const state = useContext(SupportStateContext);
  if (!state) throw new Error("Yunidesk components must be rendered inside <SupportProvider>.");
  return state;
}
