// Talks to /widget.js through its Intercom-style command queue: calls made before the script
// has loaded are queued on `window.Yunidesk.q` and replayed by the loader.

export type Alignment = "left" | "right";

export interface BootOptions {
  userToken?: string | null;
  getUserToken?: () => Promise<string | null>;
  locale?: string;
  hideDefaultLauncher?: boolean;
  alignment?: Alignment;
  verticalPadding?: number;
  horizontalPadding?: number;
  zIndex?: number;
}

type Api = ((command: string, arg?: unknown) => unknown) & { q?: unknown[][] };

interface SupportWindow extends Window {
  Yunidesk?: Api;
  YunideskSettings?: { baseUrl?: string };
}

const SCRIPT_ATTRIBUTE = "data-yunidesk";

function supportWindow(): SupportWindow | null {
  return typeof window === "undefined" ? null : (window as SupportWindow);
}

/** The loader's API, or the queueing stub until /widget.js has run. */
function api(): Api | null {
  const w = supportWindow();
  if (!w) return null;
  if (!w.Yunidesk) {
    const stub: Api = (...args: unknown[]) => {
      (stub.q = stub.q ?? []).push(args);
      return undefined;
    };
    w.Yunidesk = stub;
  }
  return w.Yunidesk;
}

export function call(command: string, arg?: unknown): unknown {
  return api()?.(command, arg);
}

/** Adds `${baseUrl}/widget.js` to the page once. */
export function loadScript(baseUrl: string): void {
  const w = supportWindow();
  if (!w || document.querySelector(`script[${SCRIPT_ATTRIBUTE}]`)) return;
  const origin = baseUrl.replace(/\/+$/, "");
  w.YunideskSettings = { ...w.YunideskSettings, baseUrl: origin };
  api(); // the queue must exist before the script runs
  const script = document.createElement("script");
  script.src = `${origin}/widget.js`;
  script.async = true;
  script.setAttribute(SCRIPT_ATTRIBUTE, "");
  document.head.appendChild(script);
}

// ---- Unread count, shared by every useYunidesk() ----

let unread = 0;
let subscribed = false;
const listeners = new Set<() => void>();

/** Registers one loader callback for the page's lifetime; components subscribe to this store. */
export function watchUnread(): void {
  if (subscribed || !supportWindow()) return;
  subscribed = true;
  call("onUnreadCountChange", (count: number) => {
    unread = count;
    listeners.forEach((listener) => listener());
  });
}

export function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUnread(): number {
  return unread;
}
