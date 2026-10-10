import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  initialMessengerState,
  messengerReducer,
  type ContactProfile,
  type MessengerAction,
  type MessengerState,
  type WidgetConfig,
} from "yunidesk";
import { SupportApiError, SupportClient, type ConnectionState } from "yunidesk/client";
import { createFrameStorage } from "../lib/storage";
import { requestHostToken } from "./host";

export interface SessionSpec {
  /** Changes when the person behind the messenger changes (login, logout, shutdown). */
  key: string;
  userToken: string | null;
  tokenProvider: boolean;
}

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type LoadError = "signin" | "generic";
export type FrameAction = MessengerAction | { type: "reset" };

const CONTACT_EVENTS = new Set<string>(["ready", "message.created", "conversation.updated", "conversation.read", "typing", "presence"]);

function frameReducer(state: MessengerState, action: FrameAction): MessengerState {
  if (action.type === "reset") return initialMessengerState;
  // The shared reducer returns undefined for frames it does not know (the socket's "pong", say).
  if (action.type === "event" && !CONTACT_EVENTS.has(action.event.type)) return state;
  return messengerReducer(state, action) ?? state;
}

const CONFIG_CACHE_KEY = "yunidesk:config";
const storage = createFrameStorage();

function cachedConfig(): WidgetConfig | null {
  try {
    const raw = storage.getSync(CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as WidgetConfig) : null;
  } catch {
    return null;
  }
}

async function resolveToken(session: SessionSpec | null): Promise<string | null> {
  if (!session) return null;
  return session.tokenProvider ? requestHostToken() : session.userToken;
}

/** One SupportClient, the shared messenger reducer, bootstrap and realtime. */
export function useMessengerData(session: SessionSpec | null, openConversationId: string | null) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const openRef = useRef(openConversationId);
  openRef.current = openConversationId;

  const client = useMemo(
    () =>
      new SupportClient({
        baseUrl: window.location.origin,
        channel: "web",
        storage,
        getUserToken: () => resolveToken(sessionRef.current),
      }),
    [],
  );
  const [state, dispatch] = useReducer(frameReducer, initialMessengerState);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<LoadError | null>(null);
  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [config, setConfig] = useState<WidgetConfig | null>(cachedConfig);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const loadSeq = useRef(0);

  const loadThread = useCallback(
    async (conversationId: string) => {
      const page = await client.listMessages(conversationId);
      dispatch({ type: "page", conversationId, messages: page.items, olderCursor: page.nextCursor, older: false });
    },
    [client],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const data = await client.bootstrap();
    if (seq !== loadSeq.current) return;
    setContact(data.contact);
    setConfig(data.config);
    storage.set(CONFIG_CACHE_KEY, JSON.stringify(data.config));
    dispatch({ type: "conversations", conversations: data.conversations });
    dispatch({ type: "event", event: { type: "presence", online: data.config.online } });
    setStatus("ready");
    setError(null);
  }, [client]);

  const start = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await load();
      client.connect();
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof SupportApiError && cause.status === 403 ? "signin" : "generic");
    }
  }, [client, load]);

  useEffect(() => {
    const offs = [
      client.on("event", (event) => dispatch({ type: "event", event })),
      client.on("connection", setConnection),
      client.on("session", setContact),
      client.on("reconnected", () => {
        void load().catch(() => undefined);
        const open = openRef.current;
        if (open && !open.startsWith("tmp_")) void loadThread(open).catch(() => undefined);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [client, load, loadThread]);

  const sessionKey = session?.key ?? null;
  useEffect(() => {
    loadSeq.current += 1;
    dispatch({ type: "reset" });
    setContact(null);
    if (!sessionKey) {
      client.disconnect();
      setStatus("idle");
      return;
    }
    let cancelled = false;
    void client.setUserTokenProvider(() => resolveToken(sessionRef.current)).then(() => {
      if (!cancelled) void start();
    });
    return () => {
      cancelled = true;
    };
  }, [client, sessionKey, start]);

  const hasTyping = Object.keys(state.typing).length > 0;
  useEffect(() => {
    if (!hasTyping) return;
    const timer = window.setInterval(() => dispatch({ type: "expireTyping", now: Date.now() }), 1000);
    return () => window.clearInterval(timer);
  }, [hasTyping]);

  /** Logout: forget the anonymous visitor stored on this device. */
  const forget = useCallback(() => client.reset(), [client]);

  return { client, state, dispatch, status, error, contact, config, connection, retry: start, loadThread, forget };
}

export type MessengerData = ReturnType<typeof useMessengerData>;
