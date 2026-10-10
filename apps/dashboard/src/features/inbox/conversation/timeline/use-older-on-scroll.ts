import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

interface Options {
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<unknown>;
  /** Changes when older messages are prepended. */
  firstId: string | undefined;
}

const NEAR_TOP_PX = 240;

function firstVisible(root: HTMLElement): { id: string; offset: number } | null {
  const top = root.getBoundingClientRect().top;
  for (const el of root.querySelectorAll<HTMLElement>("[data-message-id]")) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > top) return { id: el.dataset.messageId!, offset: rect.top - top };
  }
  return null;
}

/** Loads older pages near the top, keeping the message the agent was reading exactly in place. */
export function useOlderOnScroll(scroller: RefObject<HTMLDivElement | null>, { hasOlder, loadingOlder, loadOlder, firstId }: Options) {
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const ready = useRef(false);

  const onScroll = useCallback(() => {
    const root = scroller.current;
    if (!root || !ready.current || !hasOlder || loadingOlder || anchor.current) return;
    if (root.scrollTop > NEAR_TOP_PX) return;
    anchor.current = firstVisible(root);
    void loadOlder();
  }, [scroller, hasOlder, loadingOlder, loadOlder]);

  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root || !firstId) return;
    if (!ready.current) {
      // First render with messages: start at the bottom, then allow loading older ones.
      root.scrollTop = root.scrollHeight;
      setTimeout(() => (ready.current = true), 150);
      return;
    }
    if (anchor.current) {
      // Grouping may change above the anchor, so restore by element rather than by height.
      const el = root.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.current.id)}"]`);
      if (el) root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - anchor.current.offset;
      anchor.current = null;
    }
  }, [scroller, firstId]);

  // A load that ended without new messages (error, race) must not leave the anchor set forever.
  const wasLoading = useRef(false);
  useLayoutEffect(() => {
    if (wasLoading.current && !loadingOlder) anchor.current = null;
    wasLoading.current = loadingOlder;
  }, [loadingOlder]);

  return onScroll;
}
