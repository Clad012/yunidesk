import { useEffect, useSyncExternalStore } from "react";
import { Store, useStore } from "@/lib/realtime/store";

export type ThemePreference = "light" | "dark" | "system";
const KEY = "ys-theme";

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

const preferenceStore = new Store<ThemePreference>(readPreference());
const media = window.matchMedia("(prefers-color-scheme: dark)");
const subscribeMedia = (cb: () => void) => {
  media.addEventListener("change", cb);
  return () => media.removeEventListener("change", cb);
};

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // storage blocked; keep it for this tab only
  }
  preferenceStore.set(preference);
}

export function useTheme(): { preference: ThemePreference; resolved: "light" | "dark" } {
  const preference = useStore(preferenceStore, (p) => p);
  const systemDark = useSyncExternalStore(subscribeMedia, () => media.matches);
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  return { preference, resolved };
}

/** Keeps the `dark` class on <html> in sync. Mount once. */
export function useApplyTheme(): void {
  const { resolved } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
}
