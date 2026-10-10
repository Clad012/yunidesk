import { useCallback, useState } from "react";

/** Screen-reader announcements for messages that arrive while the panel is open. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    // Clearing first makes repeated identical messages announce again.
    setMessage("");
    window.setTimeout(() => setMessage(text), 50);
  }, []);
  return { announce, message };
}

export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
