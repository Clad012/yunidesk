# yunidesk-react-native

Native support messenger for React Native and Expo apps. Talks to a Yunidesk server (`apps/server`).

```tsx
import { SupportProvider, SupportMessenger, useSupport } from "yunidesk-react-native";

<SafeAreaProvider>
  <SupportProvider baseUrl="https://support.example.com" getUserToken={fetchSupportToken} userId={user?.id} locale="fr">
    <App />
  </SupportProvider>
</SafeAreaProvider>

// a screen (Expo Router: app/support.tsx)
export default function Support() {
  return <SupportMessenger onClose={() => router.back()} />;
}

// anywhere
const { unreadCount, open } = useSupport();
```

`getUserToken` returns a token your backend signs with the server's `IDENTITY_SECRET` (`signUserToken` from `yunidesk/identity`). Never ship that secret in the app.

## Peer dependencies

Required: `react`, `react-native`, `react-native-safe-area-context`.

## Attachments (photos and files)

Attachments are optional and pluggable through the `attachmentPicker` prop on `SupportProvider`:

| Your app | What to do |
|---|---|
| Expo (managed or dev build), or bare RN with Expo modules | Install `expo-image-picker` and `expo-document-picker`. They are detected automatically. Add the camera and photo library usage texts (the `expo-image-picker` config plugin in `app.json`). |
| Bare React Native with other libraries | Pass your own picker (below). |
| No attachments | `attachmentPicker={null}`; the attach button is hidden. |

Bare React Native apps that don't use Expo's Metro config and don't have the Expo pickers must turn on optional requires in `metro.config.js`, or pass `attachmentPicker` explicitly:

```js
config.transformer.allowOptionalDependencies = true;
```

### Your own picker

```ts
import type { AttachmentPicker } from "yunidesk-react-native";

const picker: AttachmentPicker = {
  sources: ["library", "document"], // any of "camera" | "library" | "document"
  async pick(source, limit) {
    // open your library; `limit` is how many more files fit in this message
    return { kind: "picked", files: [{ uri, name, type, size, width, height }] };
    // or { kind: "cancelled" } / { kind: "denied" } (camera permission refused)
  },
};

<SupportProvider attachmentPicker={picker} ... />
```

You can also build the Expo picker yourself from explicitly imported modules:
`createExpoAttachmentPicker({ imagePicker: ImagePicker, documentPicker: DocumentPicker })`.

Limits (checked in the app and again on the server): up to 5 files per message, 10 MB each, images (png, jpeg, gif, webp, heic), pdf, text, csv, json, zip, office documents, audio and video.
