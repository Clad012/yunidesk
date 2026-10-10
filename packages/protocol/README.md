# yunidesk

Core SDK for [Yunidesk](https://github.com/Clad012/yunidesk), the self-hosted support desk on Cloudflare.

```bash
npm install yunidesk
```

## Sign identity tokens (your server)

```ts
import { signUserToken } from "yunidesk/identity";

const token = await signUserToken(
  { userId: user.id, email: user.email, name: user.name, attributes: { plan: "pro" } },
  process.env.YUNIDESK_IDENTITY_SECRET!, // the server's IDENTITY_SECRET
  { expiresInSeconds: 3600 },
);
```

Return it from an authenticated route; the web and mobile messengers call that route through `getUserToken`. Never ship the secret to a browser or an app.

## Verify webhooks (your server)

```ts
import { verifyWebhookSignature, type WebhookPayload } from "yunidesk/webhooks";

const raw = await request.text();
if (!(await verifyWebhookSignature(secret, request.headers.get("x-yunidesk-signature"), raw))) {
  return new Response("Bad signature", { status: 401 });
}
const payload = JSON.parse(raw) as WebhookPayload;
if (payload.event === "conversation.unread_reply") {
  // send a push to the user whose id is in payload.data.contact.externalId
}
```

## Build your own client

`yunidesk/client` exports `SupportClient` (REST + websocket with heartbeat and reconnect) and the root export has every type, the messenger reducer and the en/fr copy. `yunidesk-react-native` is built on it.

Works in browsers, React Native, Node 18+, Cloudflare Workers, Deno and Bun (Web Crypto only, no dependencies).

## License

MIT
