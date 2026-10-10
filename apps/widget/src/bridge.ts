// The postMessage protocol between the loader (/widget.js, on the host page) and the
// messenger frame (/widget/). Imported by both sides, so keep it dependency free and small:
// the loader ships only what it uses from here.

export const BRIDGE_SOURCE = "yunidesk";

/** Geometry shared by the loader (iframe size) and the frame (panel and launcher placement). */
export const FRAME = {
  /** Transparent room around the launcher and panel so their shadows are not clipped. */
  pad: 20,
  launcher: 56,
  /** Space between the launcher and the open panel. */
  gap: 16,
  panelWidth: 400,
  panelMaxHeight: 720,
  /** Viewport height the panel leaves free (launcher, gap, top margin). */
  viewportMargin: 104,
  /** Below this width (or height) the open panel takes the whole screen. */
  mobileWidth: 640,
  mobileHeight: 480,
} as const;

export type Alignment = "left" | "right";
/** `launcher`: the closed bubble. `panel`: the open messenger. */
export type FrameSize = "launcher" | "panel";

export interface BootPayload {
  /** A static identity token, or null for an anonymous visitor (or when `tokenProvider` is set). */
  userToken: string | null;
  /** The host passed `getUserToken`; the frame asks for fresh tokens with `tokenRequest`. */
  tokenProvider: boolean;
  locale: string | null;
  hideDefaultLauncher: boolean;
  alignment: Alignment | null;
  mobile: boolean;
}

export interface UpdatePayload {
  userToken?: string | null;
  tokenProvider?: boolean;
  locale?: string | null;
}

/** Loader → frame. */
export type HostMessage =
  | { type: "boot"; payload: BootPayload }
  | { type: "update"; payload: UpdatePayload }
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "showNewMessage"; payload: { text: string | null } }
  | { type: "shutdown" }
  | { type: "viewport"; payload: { mobile: boolean } }
  /** The iframe now has the size the frame asked for; the frame may start its animation. */
  | { type: "resized"; payload: { size: FrameSize } }
  /** `failed`: the host's getUserToken threw. Not the same as null (a signed-out visitor). */
  | { type: "token"; payload: { requestId: string; token: string | null; failed?: boolean } };

/** Frame → loader. */
export type FrameMessage =
  | { type: "ready" }
  | { type: "meta"; payload: { title: string; alignment: Alignment } }
  | { type: "state"; payload: { open: boolean; size: FrameSize } }
  | { type: "unread"; payload: { count: number } }
  | { type: "tokenRequest"; payload: { requestId: string } };

type Envelope<T> = T & { source: typeof BRIDGE_SOURCE };

export function envelope<T extends HostMessage | FrameMessage>(message: T): Envelope<T> {
  return { source: BRIDGE_SOURCE, ...message };
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 8000): v is string => typeof v === "string" && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isStrOrNull = (v: unknown, max?: number): v is string | null => v === null || isStr(v, max);
const isAlignment = (v: unknown): v is Alignment => v === "left" || v === "right";
const isSize = (v: unknown): v is FrameSize => v === "launcher" || v === "panel";
const isRequestId = (v: unknown): v is string => isStr(v, 64) && v.length > 0;

function unwrap(data: unknown): { type: unknown; payload: Obj | undefined } | null {
  if (!isObj(data) || data.source !== BRIDGE_SOURCE || !isStr(data.type, 32)) return null;
  if (data.payload !== undefined && !isObj(data.payload)) return null;
  return { type: data.type, payload: data.payload as Obj | undefined };
}

/** Validates a message posted by the frame. Returns null for anything malformed or foreign. */
export function parseFrameMessage(data: unknown): FrameMessage | null {
  const m = unwrap(data);
  if (!m) return null;
  const p = m.payload;
  switch (m.type) {
    case "ready":
      return { type: "ready" };
    case "meta":
      return p && isStr(p.title, 200) && isAlignment(p.alignment)
        ? { type: "meta", payload: { title: p.title, alignment: p.alignment } }
        : null;
    case "state":
      return p && isBool(p.open) && isSize(p.size) ? { type: "state", payload: { open: p.open, size: p.size } } : null;
    case "unread":
      return p && typeof p.count === "number" && Number.isInteger(p.count) && p.count >= 0
        ? { type: "unread", payload: { count: p.count } }
        : null;
    case "tokenRequest":
      return p && isRequestId(p.requestId) ? { type: "tokenRequest", payload: { requestId: p.requestId } } : null;
    default:
      return null;
  }
}

/** Validates a message posted by the host page's loader. */
export function parseHostMessage(data: unknown): HostMessage | null {
  const m = unwrap(data);
  if (!m) return null;
  const p = m.payload;
  switch (m.type) {
    case "open":
    case "close":
    case "toggle":
    case "shutdown":
      return { type: m.type };
    case "boot":
      if (
        !p ||
        !isStrOrNull(p.userToken) ||
        !isBool(p.tokenProvider) ||
        !isStrOrNull(p.locale, 35) ||
        !isBool(p.hideDefaultLauncher) ||
        !(p.alignment === null || isAlignment(p.alignment)) ||
        !isBool(p.mobile)
      ) {
        return null;
      }
      return {
        type: "boot",
        payload: {
          userToken: p.userToken,
          tokenProvider: p.tokenProvider,
          locale: p.locale,
          hideDefaultLauncher: p.hideDefaultLauncher,
          alignment: p.alignment,
          mobile: p.mobile,
        },
      };
    case "update": {
      if (!p) return null;
      const payload: UpdatePayload = {};
      if ("userToken" in p) {
        if (!isStrOrNull(p.userToken)) return null;
        payload.userToken = p.userToken;
      }
      if ("tokenProvider" in p) {
        if (!isBool(p.tokenProvider)) return null;
        payload.tokenProvider = p.tokenProvider;
      }
      if ("locale" in p) {
        if (!isStrOrNull(p.locale, 35)) return null;
        payload.locale = p.locale;
      }
      return { type: "update", payload };
    }
    case "showNewMessage":
      return p && isStrOrNull(p.text, 5000) ? { type: "showNewMessage", payload: { text: p.text } } : null;
    case "viewport":
      return p && isBool(p.mobile) ? { type: "viewport", payload: { mobile: p.mobile } } : null;
    case "resized":
      return p && isSize(p.size) ? { type: "resized", payload: { size: p.size } } : null;
    case "token":
      return p && isRequestId(p.requestId) && isStrOrNull(p.token) && (p.failed === undefined || isBool(p.failed))
        ? { type: "token", payload: { requestId: p.requestId, token: p.token, ...(p.failed ? { failed: true } : {}) } }
        : null;
    default:
      return null;
  }
}
