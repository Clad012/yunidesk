import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/** True while the app is in the foreground. iOS "inactive" (Control Center, app switcher) still counts as active. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") setActive(true);
      else if (status === "background") setActive(false);
    });
    return () => subscription.remove();
  }, []);
  return active;
}
