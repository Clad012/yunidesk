/** What this browser can do about push, in the order the person has to fix it. */
export type PushAvailability = "unsupported" | "install" | "denied" | "ready";

export interface BrowserTraits {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** iPhone or iPad (iPadOS reports itself as a Mac with touch). */
  isIos: boolean;
  /** Opened from the Home Screen / as an installed app. */
  isStandalone: boolean;
  permission: NotificationPermission | null;
}

export function pushAvailability(traits: BrowserTraits): PushAvailability {
  // iOS only offers Web Push to sites added to the Home Screen; in a Safari tab PushManager is missing.
  if (traits.isIos && !traits.isStandalone) return "install";
  if (!traits.hasServiceWorker || !traits.hasPushManager || !traits.hasNotification) return "unsupported";
  if (traits.permission === "denied") return "denied";
  return "ready";
}

export function browserTraits(): BrowserTraits {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isIos = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const hasNotification = "Notification" in window;
  return {
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification,
    isIos,
    isStandalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    permission: hasNotification ? Notification.permission : null,
  };
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Was this subscription made with the server's current key? (It changes if the server's secret was replaced.) */
export function sameServerKey(applicationServerKey: ArrayBuffer | null, publicKey: string): boolean {
  if (!applicationServerKey) return false;
  const current = new Uint8Array(applicationServerKey);
  const expected = fromBase64Url(publicKey);
  return current.length === expected.length && current.every((byte, i) => byte === expected[i]);
}
