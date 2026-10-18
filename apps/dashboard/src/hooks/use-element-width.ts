import { useEffect, useRef, useState } from "react";

/** Tracks an element's content width, for charts drawn at their real pixel size. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
