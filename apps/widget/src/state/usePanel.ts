import { useCallback, useEffect, useRef, useState } from "react";
import { onHostMessage, postToHost } from "./host";

export type PanelPhase = "closed" | "opening" | "open" | "closing";

const CLOSE_MS = 200;
const REVEAL_FALLBACK_MS = 160;

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Open: ask the loader for the panel-sized iframe, then animate in once it says "resized".
 * Close: animate out inside the big iframe, then shrink it back to the launcher.
 */
export function usePanel(initial: PanelPhase) {
  const [phase, setPhase] = useState<PanelPhase>(initial);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const timer = useRef<number | undefined>(undefined);

  const reveal = useCallback(() => {
    if (phaseRef.current !== "opening") return;
    window.clearTimeout(timer.current);
    // Two frames: the panel mounts in its closed pose, then transitions in. The timer covers
    // documents that get no animation frames (a background tab).
    const show = () => phaseRef.current === "opening" && setPhase("open");
    requestAnimationFrame(() => requestAnimationFrame(show));
    window.setTimeout(show, 60);
  }, []);

  const open = useCallback(() => {
    const current = phaseRef.current;
    if (current === "open" || current === "opening") return;
    window.clearTimeout(timer.current);
    phaseRef.current = "opening";
    setPhase("opening");
    postToHost({ type: "state", payload: { open: true, size: "panel" } });
    if (current === "closing") reveal();
    else timer.current = window.setTimeout(reveal, REVEAL_FALLBACK_MS);
  }, [reveal]);

  const close = useCallback(() => {
    const current = phaseRef.current;
    if (current === "closed" || current === "closing") return;
    window.clearTimeout(timer.current);
    phaseRef.current = "closing";
    setPhase("closing");
    postToHost({ type: "state", payload: { open: false, size: "panel" } });
    timer.current = window.setTimeout(
      () => {
        phaseRef.current = "closed";
        setPhase("closed");
        postToHost({ type: "state", payload: { open: false, size: "launcher" } });
      },
      reducedMotion() ? 0 : CLOSE_MS,
    );
  }, []);

  /** Shutdown: no animation, the loader hides the iframe itself. */
  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    phaseRef.current = "closed";
    setPhase("closed");
  }, []);

  useEffect(
    () =>
      onHostMessage((message) => {
        if (message.type === "resized" && message.payload.size === "panel") reveal();
      }),
    [reveal],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { phase, open, close, reset, toggle: () => (phaseRef.current === "open" || phaseRef.current === "opening" ? close() : open()) };
}
