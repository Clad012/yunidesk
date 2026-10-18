import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { SupportClient, type ConnectionState, type KeyValueStorage } from "yunidesk/client";
import {
  initialMessengerState,
  messengerReducer,
  type ContactProfile,
  type MessengerAction,
  type MessengerState,
  type WidgetConfig,
} from "yunidesk";
import type { ResetAction } from "./support-context";
import { useAppActive } from "./use-app-active";

export interface SessionOptions {
  baseUrl: string;
  /** null or undefined: anonymous visitor. Switching from a function to null is a logout. */
  getUserToken?: (() => Promise<string | null>) | null;
  /** The signed-in user's id; a change starts a fresh session for the new user. */
  userId?: string | null;
  storage?: KeyValueStorage;
}

function sessionReducer(state: MessengerState, action: MessengerAction | ResetAction): MessengerState {
  return action.type === "reset" ? initialMessengerState : messengerReducer(state, action);
}

/**
 * One SupportClient per provider. Identified users connect as soon as the provider mounts, so the
 * unread count is live app-wide. Anonymous visitors start lazily, when a messenger screen mounts
 * (`activate`), so opening the app never creates a visitor on the server.
 * A user switch calls `setUserTokenProvider`; a logout (token getter → null) also calls `reset()`.
 */
export function useSupportSession({ baseUrl, getUserToken, userId, storage }: SessionOptions) {
  const identified = getUserToken != null;
  const identityKey = identified ? `user:${userId ?? ""}` : "visitor";
  const tokenRef = useRef(getUserToken);
  tokenRef.current = getUserToken;
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const client = useMemo(
    () =>
      new SupportClient({
        baseUrl,
        channel: Platform.OS === "ios" ? "ios" : "android",
        // Read through refs so an inline storage object or token function never recreates the client.
        storage: {
          get: (key) => storageRef.current?.get(key) ?? null,
          set: (key, value) => storageRef.current?.set(key, value),
          remove: (key) => storageRef.current?.remove(key),
        },
        getUserToken: identified ? () => tokenRef.current?.() ?? Promise.resolve(null) : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity changes go through setUserTokenProvider
    [baseUrl],
  );

  const [state, dispatch] = useReducer(sessionReducer, initialMessengerState);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [syncTick, setSyncTick] = useState(0);
  // Which identity a messenger screen asked to start; a user switch starts over.
  const [activatedFor, setActivatedFor] = useState<string | null>(null);
  const appActive = useAppActive();

  // Bumped on every user switch so answers for the previous user are dropped.
  const generation = useRef(0);
  const switching = useRef<Promise<void>>(Promise.resolve());
  const previous = useRef({ identityKey, identified });

  // Declared before the realtime effect: in the commit where the user changes, this runs first,
  // so the realtime effect waits for the switch before it loads and reconnects.
  useEffect(() => {
    const before = previous.current;
    if (before.identityKey === identityKey) return;
    previous.current = { identityKey, identified };
    generation.current += 1;
    const logout = before.identified && !identified;
    const getToken = identified ? () => tokenRef.current?.() ?? Promise.resolve(null) : undefined;
    switching.current = (logout ? client.reset() : Promise.resolve()).then(() => client.setUserTokenProvider(getToken));
    // Forget everything shown for the previous user.
    dispatch({ type: "reset" });
    setConfig(null);
    setContact(null);
    setReady(false);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `identified` is part of `identityKey`
  }, [client, identityKey]);

  const load = useCallback(async () => {
    const started = generation.current;
    try {
      const boot = await client.bootstrap();
      if (generation.current !== started) return;
      setConfig(boot.config);
      setContact(boot.contact);
      dispatch({ type: "conversations", conversations: boot.conversations });
      dispatch({ type: "event", event: { type: "presence", online: boot.config.online } });
      setReady(true);
      setFailed(false);
    } catch {
      if (generation.current === started) setFailed(true);
    }
  }, [client]);

  const running = identified || activatedFor === identityKey;
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const offs = [
      client.on("event", (event) => dispatch({ type: "event", event })),
      client.on("connection", setConnection),
      client.on("session", setContact),
      client.on("reconnected", () => {
        setSyncTick((tick) => tick + 1);
        // The config too: business hours may have opened or closed while the app slept.
        const started = generation.current;
        client
          .bootstrap()
          .then((boot) => {
            if (cancelled || generation.current !== started) return;
            setConfig(boot.config);
            dispatch({ type: "conversations", conversations: boot.conversations });
          })
          .catch(() => undefined);
      }),
    ];
    void switching.current.then(() => {
      if (cancelled) return;
      void load();
      client.connect();
      if (AppState.currentState === "background") client.pause();
    });
    return () => {
      cancelled = true;
      for (const off of offs) off();
      client.disconnect();
    };
  }, [client, running, identityKey, load]);

  // The socket sleeps in the background; resuming counts as a reconnect, so screens refetch.
  useEffect(() => {
    if (appActive) client.resume();
    else client.pause();
  }, [client, appActive]);

  const typingActive = Object.keys(state.typing).length > 0;
  useEffect(() => {
    if (!typingActive) return;
    const timer = setInterval(() => dispatch({ type: "expireTyping", now: Date.now() }), 1000);
    return () => clearInterval(timer);
  }, [typingActive]);

  const activate = useCallback(() => setActivatedFor(identityKey), [identityKey]);

  return {
    client,
    state,
    dispatch,
    config,
    contact,
    ready,
    failed,
    connection,
    syncTick,
    appActive,
    activate,
    refresh: load,
  };
}
