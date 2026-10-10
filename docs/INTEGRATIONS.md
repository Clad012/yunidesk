# Integrations: API keys and webhooks

Connect your own servers, an AI assistant or an automation tool to Yunidesk. Two parts:

- **API keys** let your server read conversations and act on them (reply, add notes, assign, snooze, resolve).
- **Webhook endpoints** push events to your server as they happen (new conversation, new message, …).

The full API is described in OpenAPI 3.1 at `https://<your-yunidesk>/api/openapi.json`.

## API keys

Create one in **Settings → API keys** (owners only). Pick a name, the name shown on its replies, its scopes and an expiry. The key is shown **once**; Yunidesk stores only its SHA-256 hash.

```
Authorization: Bearer ydk_3f9k2m…
```

- Keys look like `ydk_` + 39 characters. The last 7 are a checksum, so typos are refused without a lookup and leaked keys are easy to spot.
- Each key acts as a **bot teammate**. Its replies and notes show its name with a "Bot" badge. It is never assigned a conversation by replying, never appears in the team list, and can't sign in to the dashboard.
- **Deny by default.** A key can call only the routes below. Team management, settings, API keys, contact export and erasure are never available to a key, whatever its scopes.
- Revoking a key works immediately. It also disables the key's bot and the webhook endpoints the key created.
- Each key is limited to 300 requests a minute. Wrong keys are throttled per IP.
- Use keys from servers only. Never put one in a website or a mobile app.

| Scope | Allows |
|---|---|
| `conversations:read` | `GET /key`, `/teammates`, `/conversations`, `/conversations/counts`, `/conversations/:id`, `/conversations/:id/messages` |
| `conversations:write` | `POST /conversations/:id/messages` (reply or note), `PATCH /conversations/:id` (status, snooze, assignee), `POST /attachments` |
| `contacts:read` | `GET /contacts`, `/contacts/:id` |
| `webhooks:write` | `/webhook-endpoints` (only the endpoints this key created) |

`GET /key` works with any valid key. It returns the key, its bot and the workspace name, so you can check a key when someone connects it.

All paths are under `/api/agent`. Errors look like `{ "error": { "code", "message" } }`.

### Typed client

```ts
import { createYunideskApi } from "yunidesk/api";

const yunidesk = createYunideskApi({ baseUrl: "https://support.example.com", apiKey: process.env.YUNIDESK_API_KEY! });

const { items } = await yunidesk.conversations.list({ view: "unassigned" });
const { items: messages } = await yunidesk.conversations.messages(items[0].id);
await yunidesk.conversations.send(items[0].id, { body: "Draft answer for the team", kind: "note" });
await yunidesk.conversations.update(items[0].id, { status: "resolved" });
```

`send` adds a `clientId` for you, so retrying a send never posts the message twice. The client refuses to send a key over plain http, except to localhost.

## Webhook endpoints

Add endpoints in **Settings → Webhooks**, or with a key that has `webhooks:write`. An integration usually creates its own endpoint when it connects:

```ts
const { endpoint, secret } = await yunidesk.webhookEndpoints.create({
  url: "https://api.example.com/yunidesk/webhook",
  events: ["conversation.created", "message.created"],
});
// Store `secret` (shown once) to verify deliveries.
```

Each delivery is a `POST` with this body:

```json
{ "id": "evt_…", "event": "message.created", "createdAt": 1791000000000, "data": { … } }
```

and these headers: `X-Yunidesk-Event`, `X-Yunidesk-Event-Id`, `X-Yunidesk-Delivery`, and `X-Yunidesk-Signature: t=<ms>,v1=<hex>`.

| Event | When |
|---|---|
| `conversation.created` | A customer starts a conversation |
| `message.created` | A message visible to the customer (not notes). `data.actor` says who wrote it (`contact`, `agent`, `bot`, `system`). Ignore your own bot's messages |
| `conversation.updated` | Status or assignee changed |
| `conversation.unread_reply` | A team reply is still unread after 2 minutes (send your push notification here) |
| `conversation.rated` | The customer rated a resolved conversation |
| `ping` | "Send test event" |

### Verify every delivery

```ts
import { verifyWebhookSignature } from "yunidesk/webhooks";

const raw = await request.text(); // the exact bytes; don't parse and re-serialise first
if (!(await verifyWebhookSignature(secret, request.headers.get("x-yunidesk-signature"), raw))) {
  return new Response("Bad signature", { status: 401 });
}
const payload = JSON.parse(raw); // drop it if you've already handled payload.id
```

The signature is HMAC-SHA256 of `"<t>.<raw body>"`. Deliveries more than 5 minutes off your clock are refused, which stops replays.

### Retries, rolling and disabling

- Answer with any 2xx within 10 seconds. Anything else, including redirects and timeouts, is retried after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h and 24 h (9 attempts over about 3 days). Retries keep the same `id`.
- An endpoint that answers **410 Gone**, or whose every delivery fails for 3 days, is disabled. You can re-enable it in Settings or with `PATCH { "enabled": true }`.
- **Rolling a secret:** the new secret signs at once. The old one keeps signing for up to 24 hours, so the header carries two `v1` values and `verifyWebhookSignature` accepts either.
- Endpoints must be public https URLs: no IP addresses, no localhost, no `*.workers.dev`.
- The delivery log (last 50 per endpoint in the dashboard) is kept 30 days. Erasing a contact also erases their deliveries.

## How secrets are stored

| Secret | Stored as |
|---|---|
| API keys | SHA-256 hash only; shown once |
| Webhook endpoint secrets | AES-256-GCM, with a key derived from `SESSION_SECRET` (HKDF, one key per purpose) and bound to the endpoint's id. Rotating `SESSION_SECRET` makes them unreadable: roll every endpoint's secret afterwards |
| Teammate passwords | PBKDF2-SHA256 |
