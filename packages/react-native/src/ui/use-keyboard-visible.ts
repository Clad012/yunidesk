import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** True while the software keyboard is up. iOS reports it as it starts moving, Android once it is shown. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subscriptions = [
      Keyboard.addListener(show, () => setVisible(true)),
      Keyboard.addListener(hide, () => setVisible(false)),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);
  return visible;
}
