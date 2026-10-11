import { useEffect, useRef, type KeyboardEvent } from "react";
import { FRAME, type Alignment } from "../bridge";
import type { PanelPhase } from "../state/usePanel";
import { useMessenger } from "../state/context";
import { ConnectionBanner } from "./common/States";
import { TabBar } from "./common/TabBar";
import { HomeScreen } from "./home/HomeScreen";
import { MessagesScreen } from "./messages/MessagesScreen";
import { ConversationScreen } from "./conversation/ConversationScreen";
import { ArticleScreen } from "./help/ArticleScreen";
import { cn } from "../lib/cn";

interface PanelProps {
  phase: PanelPhase;
  alignment: Alignment;
  fullScreen: boolean;
  withLauncher: boolean;
}

export function Panel({ phase, alignment, fullScreen, withLauncher }: PanelProps) {
  const { route, closePanel, strings } = useMessenger();
  const ref = useRef<HTMLDivElement>(null);

  // Move focus into the panel as it opens, so keyboard and screen-reader users land in it.
  useEffect(() => {
    if (phase !== "open") return;
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
      target.focus({ preventScroll: true });
    }
  }, [phase]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      closePanel();
    }
  };

  const launcherZone = withLauncher ? FRAME.launcher + FRAME.gap : 0;
  const style = fullScreen
    ? { inset: 0 }
    : { top: FRAME.pad, bottom: FRAME.pad + launcherZone, [alignment]: FRAME.pad, width: FRAME.panelWidth };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={strings.messengerTitle}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-phase={phase}
      data-align={alignment}
      data-full={fullScreen}
      className={cn(
        "ys-panel absolute flex flex-col overflow-hidden bg-canvas text-fg outline-none",
        fullScreen ? "rounded-none" : "rounded-[22px] shadow-panel",
      )}
      style={style}
    >
      <ConnectionBanner />
      {route.name === "conversation" ? (
        <ConversationScreen key={route.key} conversationId={route.id} from={route.from} />
      ) : route.name === "article" ? (
        <ArticleScreen key={route.id} articleId={route.id} helpQuery={route.helpQuery} />
      ) : (
        <>
          <div key={route.name} className="ys-fade relative flex min-h-0 flex-1 flex-col">
            {route.name === "home" ? <HomeScreen helpQuery={route.helpQuery} /> : <MessagesScreen />}
          </div>
          <TabBar active={route.name} />
        </>
      )}
    </div>
  );
}
