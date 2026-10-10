import type { KeyValueStorage } from "yunidesk/client";

/** The frame's localStorage, or memory when it is blocked (third-party storage off, private mode). */
export function createFrameStorage(): KeyValueStorage & { getSync(key: string): string | null } {
  const memory = new Map<string, string>();
  const local = (): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  const getSync = (key: string): string | null => {
    try {
      const value = local()?.getItem(key);
      if (value != null) return value;
    } catch {
      // fall through to memory
    }
    return memory.get(key) ?? null;
  };
  return {
    getSync,
    get: getSync,
    set(key, value) {
      memory.set(key, value);
      try {
        local()?.setItem(key, value);
      } catch {
        // memory keeps it for this page
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        local()?.removeItem(key);
      } catch {
        // nothing stored
      }
    },
  };
}

/** The user id inside an identity token (not verified here; the server does that). */
export function tokenSubject(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}
