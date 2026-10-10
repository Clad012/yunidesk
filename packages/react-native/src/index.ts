import type {} from "./protocol-globals";

export { SupportProvider, type SupportProviderProps } from "./provider/support-provider";
export { useSupport, type UseSupportResult } from "./provider/use-support";
export type { MessengerRoute } from "./provider/support-context";
export { SupportMessenger, type SupportMessengerProps } from "./messenger/support-messenger";
export { SupportHome, type SupportHomeProps } from "./home/support-home";
export {
  SupportConversationList,
  type SupportConversationListProps,
} from "./conversation-list/support-conversation-list";
export { SupportConversation, type SupportConversationProps } from "./conversation/support-conversation";
export type { SupportTheme, SupportPalette } from "./theme/theme";
export type { KeyValueStorage, ConnectionState } from "yunidesk/client";
export type { AttachmentPicker, PickSource, PickResult } from "./composer/attachment-picker";
export type { PickedFile } from "./logic/attachments";
export {
  createExpoAttachmentPicker,
  type ExpoImagePickerModule,
  type ExpoDocumentPickerModule,
} from "./composer/expo-picker";
