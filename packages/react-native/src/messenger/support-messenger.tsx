import { MessengerErrorBoundary } from "../ui/error-boundary";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Easing, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { SupportConversation } from "../conversation/support-conversation";
import { SupportConversationList } from "../conversation-list/support-conversation-list";
import { SupportHelpArticle } from "../help/support-help-article";
import { SupportHome } from "../home/support-home";
import { useSupportCore, type MessengerRoute } from "../provider/support-context";
import { initialStack, pop, push, replaceTopConversation, type Screen } from "./messenger-routes";

export interface SupportMessengerProps {
  /** Called when the user closes the messenger (close button, or Back on the first screen). */
  onClose: () => void;
  /** "home" (default), "messages", "new", or { conversationId } to open one conversation. */
  initialRoute?: MessengerRoute;
  /** Pad for the status bar (default true). Turn off when your navigator already pads it. */
  safeTop?: boolean;
  /**
   * Receives the messenger's Back action, for hosts that get Back from elsewhere than BackHandler
   * (inside a React Native Modal, Android's Back arrives as `onRequestClose`).
   */
  registerBack?: (back: (() => void) | null) => void;
}

/** The whole messenger in one component, with its own stack: home → conversations → conversation. */
export function SupportMessenger(props: SupportMessengerProps) {
  const { theme, strings } = useSupportCore();
  return (
    <MessengerErrorBoundary theme={theme} strings={strings}>
      <MessengerStack {...props} />
    </MessengerErrorBoundary>
  );
}

function MessengerStack({
  onClose,
  initialRoute = "home",
  safeTop = true,
  registerBack,
}: SupportMessengerProps) {
  const { theme } = useSupportCore();
  const [stack, setStack] = useState<Screen[]>(() => initialStack(initialRoute));
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;

  const go = useCallback(
    (screen: Screen) => {
      setStack((current) => push(current, screen));
      slide.setValue(width);
      Animated.timing(slide, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [slide, width],
  );

  const back = useCallback(() => {
    const previous = pop(stack);
    if (!previous) {
      onClose();
      return;
    }
    Animated.timing(slide, {
      toValue: width,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setStack(previous);
      slide.setValue(0);
    });
  }, [onClose, slide, stack, width]);

  useEffect(() => {
    if (!registerBack) return;
    registerBack(back);
    return () => registerBack(null);
  }, [back, registerBack]);

  useEffect(() => {
    if (Platform.OS !== "android" || registerBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, registerBack]);

  const openConversation = useCallback((conversationId: string) => go({ name: "conversation", conversationId }), [go]);
  const newConversation = useCallback(
    (initialText?: string) => go({ name: "conversation", conversationId: null, initialText }),
    [go],
  );
  const openArticle = useCallback((articleId: string) => go({ name: "article", articleId }), [go]);
  const openMessages = useCallback(() => go({ name: "messages" }), [go]);
  const onCreated = useCallback((id: string) => setStack((current) => replaceTopConversation(current, id)), []);

  const render = (screen: Screen, depth: number) => {
    const canGoBack = depth > 0;
    if (screen.name === "home") {
      return (
        <SupportHome
          onNewConversation={newConversation}
          onOpenConversation={openConversation}
          onOpenMessages={openMessages}
          onOpenArticle={openArticle}
          onClose={onClose}
          safeTop={safeTop}
        />
      );
    }
    if (screen.name === "messages") {
      return (
        <SupportConversationList
          onOpenConversation={openConversation}
          onNewConversation={() => newConversation()}
          onBack={canGoBack ? back : undefined}
          onClose={onClose}
          safeTop={safeTop}
        />
      );
    }
    if (screen.name === "article") {
      return (
        <SupportHelpArticle
          articleId={screen.articleId}
          onAsk={() => newConversation()}
          onBack={canGoBack ? back : undefined}
          onClose={canGoBack ? undefined : onClose}
          safeTop={safeTop}
        />
      );
    }
    return (
      <SupportConversation
        conversationId={screen.conversationId}
        initialText={screen.initialText}
        onConversationCreated={onCreated}
        onBack={canGoBack ? back : undefined}
        onClose={canGoBack ? undefined : onClose}
        safeTop={safeTop}
      />
    );
  };

  const depth = stack.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* The screen underneath stays mounted, so Back is instant and it shows while the top slides away.
          Both layers are the same element type so a screen keeps its state as it moves between them. */}
      {stack.slice(Math.max(0, depth - 1)).map((screen, offset) => {
        const index = Math.max(0, depth - 1) + offset;
        const isTop = index === depth;
        return (
          <Animated.View
            key={`s${index}`}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.background, transform: [{ translateX: isTop ? slide : 0 }] },
            ]}
            importantForAccessibility={isTop ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={!isTop}
            pointerEvents={isTop ? "auto" : "none"}
          >
            {render(screen, index)}
          </Animated.View>
        );
      })}
    </View>
  );
}
