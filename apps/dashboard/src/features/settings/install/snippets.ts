// Code samples shown in Settings → Install. Kept out of the copy table: they are code, not UI text.

export function websiteSnippet(origin: string): string {
  return `<script src="${origin}/widget.js" async></script>
<script>
  window.Yunidesk = window.Yunidesk || function () {
    (window.Yunidesk.q = window.Yunidesk.q || []).push(arguments);
  };
  window.Yunidesk("boot", {
    // Signed-in users: a token your backend signs (see Identity verification).
    // getUserToken: () => fetch("/api/support-token").then((r) => r.text()),
    locale: "en",
  });
</script>`;
}

export const identitySnippet = `import { signUserToken } from "yunidesk/identity";

// Never expose IDENTITY_SECRET to the browser.
const token = await signUserToken(
  { userId: user.id, email: user.email, name: user.name, attributes: { plan: user.plan } },
  process.env.IDENTITY_SECRET,
  { expiresInSeconds: 3600 },
);`;

export function reactSnippet(origin: string): string {
  return `import { Yunidesk } from "yunidesk-react";

export function SupportWidget({ userId }: { userId?: string }) {
  return (
    <Yunidesk
      baseUrl="${origin}"
      userId={userId}
      getUserToken={userId ? () => fetch("/api/support-token").then((r) => r.text()) : null}
    />
  );
}`;
}

export function reactNativeSnippet(origin: string): string {
  return `import { SupportProvider, SupportMessenger } from "yunidesk-react-native";

export function App() {
  return (
    <SupportProvider
      baseUrl="${origin}"
      userId={user?.id}
      getUserToken={user ? () => api.supportToken() : null}
      locale="fr-FR"
    >
      <SupportMessenger />
    </SupportProvider>
  );
}`;
}
