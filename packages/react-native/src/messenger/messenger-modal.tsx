import { useCallback, useRef } from "react";
import { Modal, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { MessengerRoute } from "../provider/support-context";
import { SupportMessenger } from "./support-messenger";

export interface MessengerModalProps {
  /** The screen to open on; null hides the modal. */
  route: MessengerRoute | null;
  onClose: () => void;
}

/**
 * The messenger presented by `useSupport().open()`: a page sheet on iOS (swipe down to close),
 * full screen on Android, where the hardware Back button walks back through the messenger first.
 */
export function MessengerModal({ route, onClose }: MessengerModalProps) {
  const back = useRef<(() => void) | null>(null);
  const registerBack = useCallback((handler: (() => void) | null) => {
    back.current = handler;
  }, []);
  const onRequestClose = useCallback(() => {
    if (Platform.OS === "android" && back.current) back.current();
    else onClose();
  }, [onClose]);

  return (
    <Modal
      visible={route !== null}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose}
    >
      {/* Its own provider: the sheet has its own safe area (no status bar inset inside a page sheet). */}
      <SafeAreaProvider>
        {route ? <SupportMessenger initialRoute={route} onClose={onClose} registerBack={registerBack} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}
