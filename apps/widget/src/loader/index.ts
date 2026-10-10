import {
  FRAME,
  envelope,
  parseFrameMessage,
  type Alignment,
  type BootPayload,
  type FrameSize,
  type HostMessage,
} from "../bridge";

// /widget.js — the only code that runs on the customer's page. Dependency free.
// Usage (Intercom style; calls made before this script loads are queued):
//   window.Yunidesk = window.Yunidesk || function () { (window.Yunidesk.q = window.Yunidesk.q || []).push(arguments); };
//   Yunidesk('boot', { userToken, locale });

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

type UpdateOptions = Pick<BootOptions, "userToken" | "getUserToken" | "locale">;
type Listener<T> = (value: T) => void;
type Api = ((command: string, arg?: unknown) => unknown) & { q?: ArrayLike<unknown>[]; loaded?: boolean };

interface HostWindow extends Window {
  Yunidesk?: Api;
  YunideskSettings?: { baseUrl?: string };
}

const w = window as HostWindow;

function install(): void {
  const previous = w.Yunidesk;
  if (previous && previous.loaded) return; // loaded twice

  // The support origin comes from this script's own URL. A page setting is only a fallback for odd
  // loaders, and must be a real string: `<a id="YunideskSettings">` in user HTML would otherwise
  // become window.YunideskSettings and could send the widget (and user tokens) elsewhere.
  const script = document.currentScript as HTMLScriptElement | null;
  const configured = w.YunideskSettings?.baseUrl;
  const source = script && script.src ? script.src : typeof configured === "string" ? configured : null;
  if (!source) return;
  const origin = new URL(source).origin;

  let iframe: HTMLIFrameElement | null = null;
  let frameReady = false;
  let pending: HostMessage[] = [];
  let options: BootOptions | null = null;
  let size: FrameSize = "launcher";
  let open = false;
  let unread = 0;
  let mobile = isMobile();
  let alignment: Alignment = "right";
  let savedOverflow: string | null = null;
  let focusBeforeOpen: Element | null = null;
  const listeners = {
    unread: new Set<Listener<number>>(),
    show: new Set<Listener<void>>(),
    hide: new Set<Listener<void>>(),
  };

  function isMobile(): boolean {
    return innerWidth < FRAME.mobileWidth || innerHeight < FRAME.mobileHeight;
  }

  function emit<T>(set: Set<Listener<T>>, value: T): void {
    set.forEach((listener) => {
      try {
        listener(value);
      } catch (error) {
        console.error("[Yunidesk]", error);
      }
    });
  }

  function post(message: HostMessage): void {
    if (!iframe || !frameReady || !iframe.contentWindow) {
      pending.push(message);
      return;
    }
    iframe.contentWindow.postMessage(envelope(message), origin);
  }

  function bootPayload(o: BootOptions): BootPayload {
    return {
      userToken: o.getUserToken ? null : (o.userToken ?? null),
      tokenProvider: Boolean(o.getUserToken),
      locale: o.locale ?? null,
      hideDefaultLauncher: Boolean(o.hideDefaultLauncher),
      alignment: o.alignment ?? null,
      mobile,
    };
  }

  function createFrame(): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.src = `${origin}/widget/`;
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("allowtransparency", "true");
    frame.setAttribute("title", "");
    frame.style.cssText =
      "position:fixed;border:0;margin:0;padding:0;background:transparent;color-scheme:normal;display:none;max-width:100%;max-height:100%;";
    (document.body || document.documentElement).appendChild(frame);
    return frame;
  }

  function lockScroll(lock: boolean): void {
    const root = document.documentElement.style;
    if (lock && savedOverflow === null) {
      savedOverflow = root.overflow;
      root.overflow = "hidden";
    } else if (!lock && savedOverflow !== null) {
      root.overflow = savedOverflow;
      savedOverflow = null;
    }
  }

  function layout(): void {
    if (!iframe) return;
    const s = iframe.style;
    const o = options;
    const hidden = !o || (size === "launcher" && o.hideDefaultLauncher);
    if (hidden) {
      s.display = "none";
      lockScroll(false);
      return;
    }
    s.display = "block";
    s.zIndex = String(o.zIndex ?? 2147483000);
    const full = size === "panel" && mobile;
    lockScroll(full);
    if (full) {
      s.top = s.left = s.right = s.bottom = "0";
      s.width = s.height = "100%";
      return;
    }
    const { pad, launcher, gap, panelWidth, panelMaxHeight, viewportMargin } = FRAME;
    const panelHeight = Math.max(320, Math.min(panelMaxHeight, innerHeight - viewportMargin));
    const launcherZone = o.hideDefaultLauncher ? 0 : launcher + gap;
    const width = size === "panel" ? panelWidth : launcher;
    const height = size === "panel" ? panelHeight + launcherZone : launcher;
    s.top = "auto";
    s.bottom = `${(o.verticalPadding ?? 20) - pad}px`;
    s[alignment] = `${(o.horizontalPadding ?? 20) - pad}px`;
    s[alignment === "right" ? "left" : "right"] = "auto";
    s.width = `${width + pad * 2}px`;
    s.height = `${height + pad * 2}px`;
  }

  function onMessage(event: MessageEvent): void {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== origin) return;
    const message = parseFrameMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "ready": {
        frameReady = true;
        // The frame (re)loaded: give it the current state first, then anything queued.
        const queued = pending.filter((m) => m.type !== "boot");
        pending = [];
        if (options) post({ type: "boot", payload: bootPayload(options) });
        queued.forEach(post);
        break;
      }
      case "meta":
        iframe.setAttribute("title", message.payload.title);
        if (!options?.alignment) alignment = message.payload.alignment;
        layout();
        break;
      case "state": {
        const wasOpen = open;
        open = message.payload.open;
        size = message.payload.size;
        layout();
        if (size === "panel") post({ type: "resized", payload: { size } });
        if (open && !wasOpen) {
          focusBeforeOpen = document.activeElement;
          if (focusBeforeOpen !== iframe) iframe.focus();
          emit(listeners.show, undefined);
        } else if (!open && wasOpen) {
          if (options?.hideDefaultLauncher && focusBeforeOpen instanceof HTMLElement) focusBeforeOpen.focus();
          focusBeforeOpen = null;
          emit(listeners.hide, undefined);
        }
        break;
      }
      case "unread":
        if (message.payload.count !== unread) {
          unread = message.payload.count;
          emit(listeners.unread, unread);
        }
        break;
      case "tokenRequest": {
        const { requestId } = message.payload;
        const provider = options?.getUserToken;
        const reply = (token: string | null, failed = false) =>
          post({ type: "token", payload: { requestId, token, ...(failed ? { failed: true } : {}) } });
        if (!provider) reply(options?.userToken ?? null);
        else
          provider().then(
            (token) => reply(token ?? null),
            // A failing provider must not turn a signed-in user into an anonymous visitor.
            () => reply(null, true),
          );
        break;
      }
    }
  }

  function boot(next: BootOptions = {}): void {
    if (options) {
      // Booting again (another user, other settings): keep the frame, refresh everything.
      options = { ...next };
      alignment = next.alignment ?? alignment;
      post({ type: "boot", payload: bootPayload(options) });
      layout();
      return;
    }
    options = { ...next };
    if (next.alignment) alignment = next.alignment;
    if (!iframe) {
      iframe = createFrame();
      addEventListener("message", onMessage);
      addEventListener("resize", onResize);
    }
    post({ type: "boot", payload: bootPayload(options) });
    size = "launcher";
    layout();
  }

  function onResize(): void {
    const next = isMobile();
    if (next !== mobile) {
      mobile = next;
      post({ type: "viewport", payload: { mobile } });
    }
    layout();
  }

  function update(next: UpdateOptions = {}): void {
    if (!options) return;
    options = { ...options, ...next };
    if ("getUserToken" in next && !next.getUserToken) delete options.getUserToken;
    post({
      type: "update",
      payload: {
        ...("userToken" in next || "getUserToken" in next
          ? { userToken: options.getUserToken ? null : (options.userToken ?? null), tokenProvider: Boolean(options.getUserToken) }
          : {}),
        ...("locale" in next ? { locale: next.locale ?? null } : {}),
      },
    });
  }

  function shutdown(): void {
    if (!options) return;
    post({ type: "shutdown" });
    options = null;
    open = false;
    size = "launcher";
    layout();
    if (unread) {
      unread = 0;
      emit(listeners.unread, 0);
    }
  }

  function subscribe<T>(set: Set<Listener<T>>, callback: unknown, initial?: () => void): (() => void) | undefined {
    if (typeof callback !== "function") return undefined;
    set.add(callback as Listener<T>);
    initial?.();
    return () => {
      set.delete(callback as Listener<T>);
    };
  }

  const api: Api = (command, arg) => {
    switch (command) {
      case "boot":
        return boot(arg as BootOptions | undefined);
      case "update":
        return update(arg as UpdateOptions | undefined);
      case "shutdown":
        return shutdown();
      case "open":
      case "close":
      case "toggle":
        if (options) post({ type: command });
        return undefined;
      case "showNewMessage":
        if (options) post({ type: "showNewMessage", payload: { text: typeof arg === "string" ? arg : null } });
        return undefined;
      case "onUnreadCountChange":
        return subscribe(listeners.unread, arg, () => (arg as Listener<number>)(unread));
      case "onShow":
        return subscribe(listeners.show, arg);
      case "onHide":
        return subscribe(listeners.hide, arg);
      default:
        console.warn(`[Yunidesk] unknown command "${command}"`);
        return undefined;
    }
  };
  api.loaded = true;

  const queue = previous?.q ?? [];
  w.Yunidesk = api;
  for (let i = 0; i < queue.length; i++) {
    const args = queue[i]!;
    api(args[0] as string, args[1]);
  }
}

install();
