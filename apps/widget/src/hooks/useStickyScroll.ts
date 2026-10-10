import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

interface Options {
  /** Changes whenever the list's content changes (last message id, count, typing…). */
  contentKey: string;
  /** Id of the newest message, to tell "new message arrived" from "older page loaded". */
  lastId: string | null;
  /** Id of the oldest message; changes when an older page is prepended. */
  firstId: string | null;
  /** The newest message is the contact's own: always follow it. */
  lastIsMine: boolean;
  canLoadOlder: boolean;
  loadOlder: () => Promise<void>;
}

/**
 * Chat scrolling: start at the bottom, follow new messages while the reader is at the bottom,
 * otherwise offer a "new messages" pill; load older pages near the top without jumping.
 */
export function useStickyScroll(ref: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>, options: Options) {
  const atBottom = useRef(true);
  const anchor = useRef<{ height: number; top: number; firstId: string | null } | null>(null);
  const loading = useRef(false);
  const lastId = useRef<string | null>(null);
  const [showPill, setShowPill] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const opts = useRef(options);
  opts.current = options;

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const el = ref.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      atBottom.current = true;
      setShowPill(false);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (anchor.current && options.firstId !== anchor.current.firstId) {
      // An older page was prepended: keep the same message under the reader's eyes.
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
      return;
    }
    const newMessage = options.lastId !== lastId.current;
    const first = lastId.current === null;
    lastId.current = options.lastId;
    if (first || atBottom.current || (newMessage && options.lastIsMine)) scrollToBottom(!first && newMessage);
    else if (newMessage) setShowPill(true);
  }, [options.contentKey, options.lastId, options.firstId, options.lastIsMine, ref, scrollToBottom]);

  // Images and cards change height after render; stay pinned while at the bottom.
  useEffect(() => {
    const content = contentRef.current;
    const el = ref.current;
    if (!content || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current && !anchor.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [ref, contentRef]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) {
      setShowPill(false);
      anchor.current = null;
    }
    const { canLoadOlder, loadOlder } = opts.current;
    if (el.scrollTop < NEAR_TOP_PX && canLoadOlder && !loading.current) {
      loading.current = true;
      setLoadingOlder(true);
      // The spinner is an overlay, so the height measured now is the height before the new page.
      anchor.current = { height: el.scrollHeight, top: el.scrollTop, firstId: opts.current.firstId };
      // The anchor is consumed by the layout effect once the page renders (after this promise settles).
      loadOlder()
        .catch(() => {
          anchor.current = null;
        })
        .finally(() => {
          loading.current = false;
          setLoadingOlder(false);
        });
    }
  }, [ref]);

  return { onScroll, showPill, scrollToBottom, loadingOlder };
}
