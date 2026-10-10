import { useContext, useMemo } from "react";
import { totalUnread, type ContactProfile } from "yunidesk";
import type { ConnectionState } from "yunidesk/client";
import { SupportCoreContext, SupportStateContext, type MessengerRoute } from "./support-context";

export interface UseSupportResult {
  /** Unread teammate replies across all conversations. Live while the provider runs (see SupportProvider). */
  unreadCount: number;
  /** Presents the messenger in a modal owned by the provider. */
  open: (route?: MessengerRoute) => void;
  close: () => void;
  /** The first bootstrap finished. */
  ready: boolean;
  connection: ConnectionState;
  contact: ContactProfile | null;
  /** Re-fetches settings and conversations. */
  refresh: () => Promise<void>;
}

export function useSupport(): UseSupportResult {
  const core = useContext(SupportCoreContext);
  const state = useContext(SupportStateContext);
  if (!core || !state) throw new Error("useSupport() must be used inside <SupportProvider>.");
  const unreadCount = useMemo(() => totalUnread(state), [state]);
  const { open, close, ready, connection, contact, refresh } = core;
  return useMemo(
    () => ({ unreadCount, open, close, ready, connection, contact, refresh }),
    [unreadCount, open, close, ready, connection, contact, refresh],
  );
}
