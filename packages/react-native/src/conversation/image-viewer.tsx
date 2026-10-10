import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  View,
  useWindowDimensions,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Attachment, SupportStrings } from "yunidesk";
import { IconButton } from "../ui/icon-button";

export interface ImageViewerProps {
  attachment: Attachment | null;
  strings: SupportStrings;
  onClose: () => void;
}

/** Full-screen image on black. Pinch to zoom on iOS (a zoomable ScrollView); Android shows it fitted. */
export function ImageViewer({ attachment, strings, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  return (
    <Modal
      visible={attachment !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
      onShow={() => setLoading(true)}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: "#000000" }} accessibilityViewIsModal>
        {attachment ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ width, height, alignItems: "center", justifyContent: "center" }}
            maximumZoomScale={Platform.OS === "ios" ? 4 : 1}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: attachment.url }}
              style={{ width, height }}
              resizeMode="contain"
              accessibilityLabel={attachment.fileName}
              onLoadEnd={() => setLoading(false)}
            />
          </ScrollView>
        ) : null}
        {loading ? (
          <ActivityIndicator
            color="#FFFFFF"
            style={{ position: "absolute", alignSelf: "center", top: height / 2 - 10 }}
          />
        ) : null}
        <IconButton
          icon="close"
          label={strings.closeImage}
          onPress={onClose}
          color="#FFFFFF"
          background="rgba(255, 255, 255, 0.18)"
          size={40}
          style={{ position: "absolute", top: insets.top + 8, right: insets.right + 16 }}
        />
      </View>
    </Modal>
  );
}
