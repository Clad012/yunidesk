import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStrings, resolveLocale, totalUnread } from "yunidesk";
import { Launcher } from "./components/Launcher";
import { LiveRegion, useAnnouncer } from "./components/LiveRegion";
import { Panel } from "./components/Panel";
import { postToHost } from "./state/host";
import { MessengerContext, conversationRoute, type MessengerContextValue, type Route } from "./state/context";
import { useActions } from "./state/useActions";
import { useBrandTheme } from "./state/useBrandTheme";
import { useHostSession, type HostCommands } from "./state/useHostSession";
import { useMessengerData } from "./state/useMessengerData";
import { usePanel } from "./state/usePanel";
import { useFocusTrap } from "./hooks/useFocusTrap";

export function App() {
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [prefill, setPrefill] = useState<MessengerContextValue["prefill"]>(null);
  const panel = usePanel(window.parent === window ? "open" : "closed");
  const { announce, message: announcement } = useAnnouncer();
  const dataRef = useRef<{ forget: () => Promise<void> } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Tab cycles through the panel and the launcher while open.
  useFocusTrap(rootRef, panel.phase === "open");

  const commands = useMemo<HostCommands>(
    () => ({
      onCommand: (message) => {
        if (message.type === "open") panel.open();
        else if (message.type === "close") panel.close();
        else if (message.type === "toggle") panel.toggle();
        else {
          setRoute(conversationRoute(null, "home"));
          setPrefill({ text: message.payload.text ?? "", nonce: Date.now() });
          panel.open();
        }
      },
      onShutdown: () => {
        void dataRef.current?.forget();
        panel.reset();
        setRoute({ name: "home" });
        setPrefill(null);
      },
    }),
    // panel callbacks are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const host = useHostSession(commands);
  // Another person (login, logout, reboot): their conversations are not ours, start from home.
  const sessionKey = host.session?.key ?? null;
  const previousSession = useRef(sessionKey);
  useEffect(() => {
    if (previousSession.current === sessionKey) return;
    previousSession.current = sessionKey;
    setRoute({ name: "home" });
  }, [sessionKey]);

  const conversationId = route.name === "conversation" ? route.id : null;
  const data = useMessengerData(host.session, conversationId);
  dataRef.current = data;

  const onRekey = useCallback((fromId: string, toId: string) => {
    setRoute((r) => (r.name === "conversation" && r.id === fromId ? { ...r, id: toId } : r));
  }, []);
  const actions = useActions(data, onRekey);

  const locale = resolveLocale(host.boot?.locale ?? navigator.language);
  const strings = getStrings(locale);
  const alignment = host.boot?.alignment ?? data.config?.launcherPosition ?? "right";
  useBrandTheme(data.config?.brandColor ?? null);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = strings.messengerTitle;
    if (host.boot) postToHost({ type: "meta", payload: { title: strings.messengerTitle, alignment } });
  }, [locale, strings, alignment, host.boot]);

  const unread = totalUnread(data.state);
  useEffect(() => postToHost({ type: "unread", payload: { count: unread } }), [unread]);

  const fullScreen = host.mobile || host.standalone;
  const hideLauncher = host.standalone || (host.boot?.hideDefaultLauncher ?? false);
  const panelOpen = panel.phase === "open" || panel.phase === "opening";

  const startConversation = useCallback((text?: string) => {
    setRoute(conversationRoute(null, "home"));
    if (text) setPrefill({ text, nonce: Date.now() });
  }, []);

  const value = useMemo<MessengerContextValue>(
    () => ({
      strings,
      locale,
      data,
      actions,
      route,
      navigate: setRoute,
      mobile: fullScreen,
      showCloseButton: !host.standalone && (fullScreen || hideLauncher),
      panelOpen,
      closePanel: panel.close,
      prefill,
      announce,
      startConversation,
    }),
    [strings, locale, data, actions, route, fullScreen, host.standalone, hideLauncher, panelOpen, panel.close, prefill, announce, startConversation],
  );

  if (!host.boot) return null;
  const launcherVisible = !hideLauncher && !(fullScreen && panel.phase !== "closed") && data.config !== null;

  return (
    <MessengerContext.Provider value={value}>
      <div ref={rootRef} className="ys-root contents" data-align={alignment}>
        {panel.phase !== "closed" && (
          <Panel phase={panel.phase} alignment={alignment} fullScreen={fullScreen} withLauncher={!hideLauncher} />
        )}
        {launcherVisible && (
          <Launcher open={panelOpen} unread={unread} alignment={alignment} onToggle={panel.toggle} />
        )}
      </div>
      <LiveRegion message={announcement} />
    </MessengerContext.Provider>
  );
}
