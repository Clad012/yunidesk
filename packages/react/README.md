# yunidesk-react

Embed the [Yunidesk](https://github.com/Clad012/yunidesk) web messenger in a React or Next.js app.

```bash
npm install yunidesk-react
```

```tsx
import { Yunidesk, useYunidesk } from "yunidesk-react";

export function Support({ user }: { user: { id: string } | null }) {
  return (
    <Yunidesk
      baseUrl="https://support.example.com"
      getUserToken={async () => {
        const res = await fetch("/api/support-token");
        return res.ok ? ((await res.json()) as { token: string }).token : null;
      }}
      userId={user?.id ?? null}
      locale="en"
    />
  );
}

// anywhere
const { open, showNewMessage, unreadCount } = useYunidesk();
```

`<Yunidesk />` renders nothing itself: it loads `<baseUrl>/widget.js`, which adds the launcher and the messenger iframe. Your site's origin must be listed in the server's `ALLOWED_ORIGINS` or in Settings → Install.

Props: `baseUrl`, `userToken` or `getUserToken` + `userId`, `locale`, `hideDefaultLauncher`, `alignment` (`"left" | "right"`), `verticalPadding`, `horizontalPadding`, `zIndex`.

Signing out (`userId` → `null`) or unmounting shuts the messenger down and forgets the visitor on this device.

Without React, paste the script tag from the dashboard's Settings → Install.

## License

MIT
