import { useEffect } from "react";
import { brandTheme } from "../lib/color";

/** Publishes the brand colours (with readable text and ink variants) as CSS variables. */
export function useBrandTheme(brandColor: string | null): void {
  useEffect(() => {
    const theme = brandTheme(brandColor ?? "#6d5dfc");
    const root = document.documentElement.style;
    root.setProperty("--ys-brand", theme.brand);
    root.setProperty("--ys-on-brand", theme.onBrand);
    root.setProperty("--ys-brand-deep", theme.brandDeep);
    root.setProperty("--ys-ink-light", theme.inkLight);
    root.setProperty("--ys-ink-dark", theme.inkDark);
  }, [brandColor]);
}
