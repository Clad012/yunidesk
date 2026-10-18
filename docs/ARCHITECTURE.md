# Yunidesk — architecture

A self-hosted Intercom/Crisp-style support desk on Cloudflare: one Worker, one D1 database, one R2 bucket, two Durable Object classes. It runs apart from your product, so a broken app deploy never takes support down.

```
apps/server      Worker (Hono): REST API, websockets, cron jobs; serves the dashboard and widget builds from ./public
apps/dashboard   Team inbox (React, Vite, TanStack Router + Query, Tailwind 4, shadcn/ui, Magic UI) → built into server/public
apps/widget      Website messenger: iframe app (/widget/) + tiny loader (/widget.js) → built into server/public
packages/protocol  (npm: yunidesk) Shared types, limits, en/fr copy, identity tokens, contact client (REST + realtime)
packages/react     (npm: yunidesk-react) <Yunidesk/> for host web apps (Next.js) — loads /widget.js
packages/react-native  (npm: yunidesk-react-native) Native messenger for Expo / React Native apps
```

## Data (all pinned to the EU)

- **D1** `yunidesk` (`--jurisdiction eu`): agents, sessions, invites, contacts, conversations, messages (+ FTS5), attachments, settings, saved replies, inbound emails as received (`email_originals`). Schema: `apps/server/migrations`.
- **R2** `yunidesk-files` (`jurisdiction: eu`): attachments (private, served through signed links) and team avatars (public).
- **Durable Objects** (`DATA_JURISDICTION=eu`): `InboxHub` (one, the team's live room) and `ContactChannel` (one per contact, all their tabs/devices). Hibernatable websockets.

D1 is the source of truth. Writes go through REST; the Worker then pushes events to the Durable Objects, which fan them out over websockets. Clients refetch after a reconnect.

## Who can do what

| Caller | Auth | Sees |
|---|---|---|
| Contact (widget, app) | `Authorization: Bearer <session>` from `POST /api/v1/session` | Their own conversations; never internal notes or assignment events |
| Teammate (dashboard) | `__Host-ys_session` cookie (HttpOnly, Secure, SameSite=Strict) + Origin check on writes and websockets | Everything |
| Host backend | — | Signs identity tokens with `IDENTITY_SECRET`; receives signed webhooks |

**Identity verification.** Signed-in users are identified by a short-lived HS256 token your backend signs with `IDENTITY_SECRET` (`signUserToken` from `yunidesk/identity`). Without a valid token a caller can only be an anonymous visitor (if allowed in settings). Anonymous visitors keep a 180-day visitor token in the widget's own storage.

**Secrets** (`wrangler secret put`): `SESSION_SECRET`, `IDENTITY_SECRET`, `SETUP_TOKEN` (first owner only), optional `RESEND_API_KEY` + `EMAIL_FROM`.

**Email channel** (optional): var `EMAIL_INBOUND_ADDRESS` (or Settings → Email), binding `SEND_EMAIL` (`send_email`, Cloudflare Email Service) and/or `RESEND_API_KEY`, optional `EMAIL_AUTHSERV_ID` (default `mx.cloudflare.net`). See [Email channel](#email-channel).

## API

Shapes are in `packages/protocol/src/types.ts`. Errors: `{ error: { code, message } }` with a 4xx/5xx status.

### Contact API — `/api/v1`
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/session` | `{ userToken?, visitorToken?, channel }` | `SessionResponse` |
| GET | `/bootstrap` | | `BootstrapResponse` |
| GET | `/conversations` | | `{ items: ContactConversation[] }` |
| POST | `/conversations` | `SendMessageInput` | `{ conversation, message }` |
| GET | `/conversations/:id` | | `ContactConversation` |
| GET | `/conversations/:id/messages` | `?before=<messageId>` | `Page<Message>` (oldest→newest; `nextCursor` = older page) |
| POST | `/conversations/:id/messages` | `SendMessageInput` | `{ conversation, message }` |
| POST | `/conversations/:id/read` | | `{ at }` |
| POST | `/conversations/:id/rating` | `{ score: 1\|2\|3, comment? }` | `ContactConversation` (resolved only) |
| PATCH | `/contact` | `{ email?, name? }` (anonymous only) | `ContactProfile` |
| POST | `/attachments` | multipart `file` (+ optional `width`, `height`) | `Attachment` |
| POST | `/ws-ticket` | | `{ ticket }` (valid 60 s) |
| GET | `/ws?ticket=` | websocket | `ContactServerEvent` frames |

### Team API — `/api/agent` (cookie; send `Origin`)
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/status` | `{ needsSetup }` |
| POST | `/auth/setup` | `{ setupToken, name, email, password }` → first owner |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| GET | `/auth/invites/:token` | `{ email, role }` |
| POST | `/auth/invites/:token/accept` | `{ name, password }` |
| GET | `/bootstrap` | `{ agent: Agent, teammates: PublicAgent[], settings: AdminSettings }` |
| GET | `/conversations` | `?view=mine\|unassigned\|open\|snoozed\|resolved\|all&q=&cursor=&contactId=` → `Page<AgentConversation>` |
| GET | `/conversations/counts` | `InboxCounts` |
| GET | `/conversations/:id` | `AgentConversation` |
| GET | `/conversations/:id/messages` | `?before=` → `Page<Message>` (includes notes and events) |
| POST | `/conversations/:id/messages` | `AgentSendMessageInput` (`kind: "text"\|"note"`); first reply auto-assigns |
| PATCH | `/conversations/:id` | `{ status?, snoozedUntil?, assigneeId? }` |
| POST | `/conversations/:id/read` | |
| POST | `/attachments` | multipart `file` |
| GET | `/contacts` | `?q=&cursor=` → `Page<Contact>` |
| GET | `/contacts/:id` | `{ contact, conversations: AgentConversation[] }` |
| GET | `/contacts/:id/export` | JSON download (GDPR access) |
| DELETE | `/contacts/:id` | owner; erases contact, messages, files (GDPR erasure) |
| PATCH | `/me` | `{ name?, currentPassword?, newPassword? }` |
| POST | `/me/avatar` | multipart `file` (png/jpeg/webp ≤ 2 MB) |
| GET | `/team` | `{ agents: (Agent & { disabled })[], invites: Invite[] }` |
| POST | `/team/invites` | owner; `{ email, role }` → `{ id, url }` (link shown once) |
| DELETE | `/team/invites/:id` | owner |
| PATCH | `/team/:id` | owner; `{ role?, disabled? }` |
| GET/PUT | `/settings` | `AdminSettings` (PUT owner, partial) |
| POST | `/settings/webhook-secret` | owner; `{ secret }` shown once |
| GET | `/conversations/:id/messages/:messageId/email` | `EmailOriginal`: the whole inbound email as text, sender checks |
| GET/PATCH | `/email` | `EmailChannelSettings` (PATCH owner; session only) |
| POST | `/email/test` | owner; sends a test email to yourself → `EmailTestResult` |
| GET/POST | `/canned-responses` | `{ shortcut, title, body }` |
| PUT/DELETE | `/canned-responses/:id` | |
| GET | `/ws` | websocket → `AgentServerEvent` frames |

Websocket client frames: `{ type: "typing", conversationId, isTyping }` and `{ type: "ping" }` (answered with `{"type":"pong"}`; send every ~25 s).

### Files
`GET /api/files/:id?exp&sig` — signed, expiring links (12 h). Images (png/jpeg/gif/webp) inline, everything else as a download; served with a sandbox CSP and `nosniff`. Uploads are checked against magic bytes.

## Widget embedding

`/widget.js` (loader, no dependencies) injects one iframe pointing at `/widget/`. The iframe's `frame-ancestors` CSP only lists `ALLOWED_ORIGINS` + the origins saved in Settings. Host ↔ iframe talk over `postMessage` with origin checks.

## Integrations (API keys, webhook endpoints)

See [INTEGRATIONS.md](INTEGRATIONS.md). In short:
- `Authorization: Bearer ydk_…` on `/api/agent/*`. The key acts as its bot teammate, the scopes are checked against a deny-by-default route list (`apps/server/src/lib/api-keys.ts`), and there is no cookie, so no CSRF check. Owners manage keys at `/api/agent/api-keys` (session only).
- Events go to the Settings webhook and to every enabled endpoint that subscribed (`apps/server/src/lib/webhooks.ts`). Endpoint deliveries are logged in `webhook_deliveries`, retried by the every-minute cron for about 3 days, and kept 30 days.
- OpenAPI 3.1 at `/api/openapi.json` (`apps/server/src/openapi.ts`).

## Webhooks

`POST <url>` with `{ id, event, createdAt, data }` and `X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256("<t>.<body>")>` (one `v1` per active secret while a secret is being rolled). Events: `conversation.created`, `message.created`, `conversation.updated`, `conversation.rated`, `conversation.unread_reply` (a reply unread for 2 minutes — send the push notification from here).

## Email channel

`apps/server/src/lib/email-channel/`. Cloudflare Email Routing hands emails for the support address and `reply+<token>@<its domain>` to the worker's `email()` handler (`inbound.ts`):

1. Refused: channel off, over 10 MB, unknown recipient, more than 20 emails an hour from one sender. Ignored (accepted, nothing created): auto-replies, bounces, list mail (`Auto-Submitted`, `X-Autoreply`, `Precedence`, `multipart/report`), our own addresses or Message-IDs, duplicates.
2. Parsed with `postal-mime`. The text/plain part is preferred; HTML-only emails are converted to text (`html-text.ts`); HTML is never shown. Quoted history and signatures are stripped (`quotes.ts`: "On … wrote:", "Le … a écrit :", Outlook header blocks, `>` quotes, `-- `); the whole text is kept in `email_originals` ("Show full email").
3. Sender check (`auth-results.ts`): the topmost `Authentication-Results` / `ARC-Authentication-Results` from the trusted authserv-id. Verified = DMARC pass for the From domain, or a DKIM pass aligned with it. SPF alone is not enough.
4. Threading (`threading.ts`): the signed reply+ token (HMAC of the conversation id with `SESSION_SECRET`), then `In-Reply-To`/`References` against stored Message-IDs. It continues a conversation only from that conversation's customer; unverified senders only through the token and never into an identified contact. Otherwise a new conversation (`channel = 'email'`, `subject`). New conversations go to a contact who already proved the address (identified, or verified by an earlier email) when the sender is verified; unverified senders get their own unverified email contact.
5. Attachments go through the upload rules (`storeAttachment`), at most 5; small inline images (logos) are skipped.

A team reply (`kind: "text"`, never notes) in an email conversation is queued on the message (`email_status = 'pending'`) and sent at once (`outbound.ts`) through the Cloudflare `send_email` binding or Resend (`transport.ts`), composed in `compose.ts`: From `"<teammate> via <team>" <from>`, Reply-To the reply+ address, `In-Reply-To` the customer's last email and `References` the thread, subject `Re: <subject>`, text + escaped HTML with the brand colour and a footer line (en/fr), attachments as 30-day signed links. Failures are retried by the every-minute cron (1 min, 5 min, 30 min, 2 h, 6 h); after the last try, or at once for permanent errors, the message is `failed` and an `email_failed` event (team only) appears in the conversation. Cloudflare Email Service sets its own Message-ID (we store the one it returns); with Resend we set ours.

Messages carry `email` metadata for the team only (`toContactMessage` strips it). The unread-reply email to visitors is skipped for email conversations: the reply already was an email.

## Jobs (cron)
- every minute: retry due webhook deliveries and email replies
- every 5 min: wake snoozed conversations
- daily: purge unsent uploads (1 day), resolved conversations older than `retentionDays`, silent anonymous visitors (30 days), webhook delivery logs (30 days), expired sessions/invites

## Local development
```
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars
pnpm --dir apps/server db:migrate:local
pnpm dev          # server :8787, dashboard :5173, widget :5174
```
Open http://localhost:5173/setup with the `SETUP_TOKEN` from `.dev.vars`.
