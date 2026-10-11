import { loadExpoAttachmentPicker } from "../composer/expo-picker";
import type { AttachmentPicker } from "../composer/attachment-picker";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import type { KeyValueStorage } from "yunidesk/client";
import { getStrings, resolveLocale, type HelpArticle } from "yunidesk";
import { resolveTheme, type SupportTheme } from "../theme/theme";
import { SupportCoreContext, SupportStateContext, type MessengerRoute, type SupportCore } from "./support-context";
import { useSupportSession } from "./use-support-session";
import { MessengerModal } from "../messenger/messenger-modal";

export interface SupportProviderProps {
  /** Origin of the support worker, for example "https://support.example.com". */
  baseUrl: string;
  /**
   * Returns an identity token your backend signed for the signed-in user.
   * Pass null (or leave it out) for anonymous visitors; going from a function to null is a logout
   * and forgets this device's visitor session.
   */
  getUserToken?: (() => Promise<string | null>) | null;
  /** The signed-in user's id. When it changes, the messenger starts a fresh session for the new user. */
  userId?: string | null;
  /** "en", "fr", or a device locale such as "fr-FR". Defaults to English. */
  locale?: string;
  theme?: SupportTheme;
  /** Forces light or dark; follows the system by default. */
  colorScheme?: "light" | "dark";
  /** Keeps an anonymous visitor's conversations across app launches (for example an AsyncStorage adapter). */
  storage?: KeyValueStorage;
  /**
   * Where attachments come from. Defaults to expo-image-picker + expo-document-picker when the app has
   * them; pass your own (any library) or `null` to turn attachments off.
   */
  attachmentPicker?: AttachmentPicker | null;
  children: ReactNode;
}

/**
 * Owns the support session for the whole app: one SupportClient, the shared messenger state and the
 * messenger modal behind `useSupport().open()`. Put it near the root, inside a SafeAreaProvider.
 *
 * Realtime: with `getUserToken` (a signed-in user) it bootstraps and opens the websocket on mount,
 * so `unreadCount` is live everywhere. For anonymous visitors it starts lazily, the first time a
 * messenger screen mounts, so merely opening the app never creates a visitor on the server.
 * The socket sleeps while the app is in the background and screens refetch when it comes back.
 */
export function SupportProvider({
  baseUrl,
  getUserToken,
  userId,
  locale: localeInput,
  theme: themeOverrides,
  colorScheme,
  storage,
  attachmentPicker: pickerProp,
  children,
}: SupportProviderProps) {
  const session = useSupportSession({ baseUrl, getUserToken, userId, storage });
  const systemScheme = useColorScheme();
  const scheme = colorScheme ?? (systemScheme === "dark" ? "dark" : "light");
  const locale = resolveLocale(localeInput);
  const strings = getStrings(locale);
  const brandColor = session.config?.brandColor;
  const theme = useMemo(() => resolveTheme(scheme, brandColor, themeOverrides), [scheme, brandColor, themeOverrides]);

  // undefined = auto-detect the Expo pickers once; null = attachments off.
  const attachmentPicker = useMemo(
    () => (pickerProp === undefined ? loadExpoAttachmentPicker() : pickerProp),
    [pickerProp],
  );

  const [modalRoute, setModalRoute] = useState<MessengerRoute | null>(null);
  const open = useCallback((route: MessengerRoute = "home") => setModalRoute(route), []);
  const close = useCallback(() => setModalRoute(null), []);

  const { client, dispatch, config, contact, ready, failed, connection, syncTick, appActive, activate, refresh } =
    session;
  // The FAQ in the user's language; without it the messenger simply has no Help section.
  const [help, setHelp] = useState<HelpArticle[]>([]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    client
      .help(locale)
      .then((page) => !cancelled && setHelp(page.items))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, ready, locale]);

  const core = useMemo<SupportCore>(
    () => ({
      client,
      locale,
      strings,
      theme,
      config,
      contact,
      help,
      ready,
      failed,
      connection,
      syncTick,
      appActive,
      dispatch,
      activate,
      refresh,
      open,
      close,
      attachmentPicker,
    }),
    [
      client,
      locale,
      strings,
      theme,
      config,
      contact,
      help,
      ready,
      failed,
      connection,
      syncTick,
      appActive,
      dispatch,
      activate,
      refresh,
      open,
      close,
      attachmentPicker,
    ],
  );

  return (
    <SupportCoreContext.Provider value={core}>
      <SupportStateContext.Provider value={session.state}>
        {children}
        <MessengerModal route={modalRoute} onClose={close} />
      </SupportStateContext.Provider>
    </SupportCoreContext.Provider>
  );
}
