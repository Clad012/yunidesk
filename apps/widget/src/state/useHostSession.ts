import { useEffect, useMemo, useState } from "react";
import type { BootPayload, HostMessage } from "../bridge";
import { tokenSubject } from "../lib/storage";
import { isEmbedded, onHostMessage, postToHost } from "./host";
import type { SessionSpec } from "./useMessengerData";

/** Opened directly (not in an iframe): a full-page messenger for an anonymous visitor. */
const STANDALONE_BOOT: BootPayload = {
  userToken: null,
  tokenProvider: false,
  locale: new URLSearchParams(window.location.search).get("locale"),
  hideDefaultLauncher: true,
  alignment: null,
  mobile: true,
};

function identity(boot: BootPayload): string {
  if (boot.tokenProvider) return "provider";
  if (boot.userToken) return `user:${tokenSubject(boot.userToken) ?? boot.userToken}`;
  return "anonymous";
}

export interface HostCommands {
  onCommand: (message: Extract<HostMessage, { type: "open" | "close" | "toggle" | "showNewMessage" }>) => void;
  /** Called before the session is dropped, to forget the visitor and reset the UI. */
  onShutdown: () => void;
}

/** Boot options from the host page; derives the session (who is chatting) from them. */
export function useHostSession(commands: HostCommands) {
  const [boot, setBoot] = useState<BootPayload | null>(isEmbedded ? null : STANDALONE_BOOT);
  const [mobile, setMobile] = useState(boot?.mobile ?? false);
  const [generation, setGeneration] = useState(0);

  useEffect(
    () =>
      onHostMessage((message) => {
        switch (message.type) {
          case "boot":
            setBoot(message.payload);
            setMobile(message.payload.mobile);
            // A boot can be for another user (same "provider" identity): always start a fresh session.
            setGeneration((g) => g + 1);
            break;
          case "update":
            setBoot((current) => (current ? { ...current, ...message.payload } : current));
            // With a token provider the frame can't see who the user is: a new provider means a new session.
            if (message.payload.tokenProvider) setGeneration((g) => g + 1);
            break;
          case "viewport":
            setMobile(message.payload.mobile);
            break;
          case "shutdown":
            commands.onShutdown();
            setBoot(null);
            setGeneration((g) => g + 1);
            break;
          case "open":
          case "close":
          case "toggle":
          case "showNewMessage":
            commands.onCommand(message);
            break;
          default:
            break;
        }
      }),
    [commands],
  );

  useEffect(() => postToHost({ type: "ready" }), []);

  const session = useMemo<SessionSpec | null>(
    () =>
      boot
        ? { key: `${generation}:${identity(boot)}`, userToken: boot.userToken, tokenProvider: boot.tokenProvider }
        : null,
    [boot, generation],
  );

  return { boot, session, mobile, standalone: !isEmbedded };
}
