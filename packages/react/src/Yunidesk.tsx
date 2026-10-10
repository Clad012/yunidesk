"use client";

import { useEffect, useRef } from "react";
import { call, loadScript, watchUnread, type Alignment, type BootOptions } from "./commands";

export interface YunideskProps {
  /** Origin of the support worker, for example https://support.example.com */
  baseUrl: string;
  /** Identity token signed by your backend for the signed-in user; null or absent for a visitor. */
  userToken?: string | null;
  /** Alternative to `userToken`: called whenever the messenger needs a fresh token. */
  getUserToken?: () => Promise<string | null>;
  /** With `getUserToken`: the signed-in user's id (null when signed out), so a user switch resets the messenger. */
  userId?: string | null;
  locale?: string;
  hideDefaultLauncher?: boolean;
  alignment?: Alignment;
  verticalPadding?: number;
  horizontalPadding?: number;
  zIndex?: number;
}

/** Shutdown is deferred a tick, so React Strict Mode's mount/unmount/mount does not forget the visitor. */
let pendingShutdown: ReturnType<typeof setTimeout> | null = null;

/**
 * Loads /widget.js once and boots the messenger. Reboots on user switch and shuts down
 * (forgetting the visitor on this device) on logout and unmount. Renders nothing.
 */
export function Yunidesk(props: YunideskProps) {
  const { baseUrl, userToken = null, userId, locale, hideDefaultLauncher, alignment, verticalPadding, horizontalPadding, zIndex } = props;
  const getUserTokenRef = useRef(props.getUserToken);
  getUserTokenRef.current = props.getUserToken;
  const hasProvider = Boolean(props.getUserToken);
  const identity = hasProvider ? (userId ?? null) : userToken;
  const booted = useRef(false);
  const lastIdentity = useRef(identity);
  const lastToken = useRef(userToken);

  const options = (): BootOptions => ({
    ...(hasProvider ? { getUserToken: () => getUserTokenRef.current?.() ?? Promise.resolve(null) } : { userToken }),
    ...(locale ? { locale } : {}),
    ...(alignment ? { alignment } : {}),
    hideDefaultLauncher: Boolean(hideDefaultLauncher),
    ...(verticalPadding !== undefined ? { verticalPadding } : {}),
    ...(horizontalPadding !== undefined ? { horizontalPadding } : {}),
    ...(zIndex !== undefined ? { zIndex } : {}),
  });
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Load, boot, and shut down on unmount. Layout options reboot (the loader keeps its iframe).
  useEffect(() => {
    if (pendingShutdown) clearTimeout(pendingShutdown);
    pendingShutdown = null;
    loadScript(baseUrl);
    watchUnread();
    call("boot", optionsRef.current());
    booted.current = true;
    return () => {
      booted.current = false;
      pendingShutdown = setTimeout(() => {
        pendingShutdown = null;
        call("shutdown");
      }, 0);
    };
  }, [baseUrl, hideDefaultLauncher, alignment, verticalPadding, horizontalPadding, zIndex]);

  // Who is chatting: logout shuts down (forgets the device's visitor) and boots a fresh visitor.
  useEffect(() => {
    const previousIdentity = lastIdentity.current;
    const previousToken = lastToken.current;
    lastIdentity.current = identity;
    lastToken.current = userToken;
    if (!booted.current || (previousIdentity === identity && previousToken === userToken)) return;
    if (previousIdentity && !identity) {
      call("shutdown");
      call("boot", optionsRef.current());
      return;
    }
    const next = optionsRef.current();
    call("update", hasProvider ? { getUserToken: next.getUserToken } : { userToken });
  }, [identity, userToken, hasProvider]);

  useEffect(() => {
    if (booted.current && locale) call("update", { locale });
  }, [locale]);

  return null;
}
