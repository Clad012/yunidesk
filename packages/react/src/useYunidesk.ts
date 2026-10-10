"use client";

import { useMemo, useSyncExternalStore } from "react";
import { call, getUnread, subscribeUnread, watchUnread } from "./commands";

export interface YunideskControls {
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Opens a new conversation, optionally with text already in the composer. */
  showNewMessage: (text?: string) => void;
  unreadCount: number;
}

/** Controls for the messenger booted by <Yunidesk />. Safe to call before it has loaded. */
export function useYunidesk(): YunideskControls {
  const unreadCount = useSyncExternalStore(
    (listener) => {
      watchUnread();
      return subscribeUnread(listener);
    },
    getUnread,
    () => 0,
  );
  const actions = useMemo(
    () => ({
      open: () => void call("open"),
      close: () => void call("close"),
      toggle: () => void call("toggle"),
      showNewMessage: (text?: string) => void call("showNewMessage", text),
    }),
    [],
  );
  return { ...actions, unreadCount };
}
