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

- **D1** `yunidesk` (`--jurisdiction eu`): agents, sessions, invites, contacts, conversations, messages (+ FTS5), attachments, settings, saved replies, tags (`tags`, `conversation_tags`), custom field definitions (`conversation_fields`; values in `conversations.custom_fields`), push subscriptions, inbound emails as received (`email_originals`). Schema: `apps/server/migrations`.
- **R2** `yunidesk-files` (`jurisdiction: eu`): attachments (private, served through signed links) and team avatars (public).
- **Durable Objects** (`DATA_JURISDICTION=eu`): `InboxHub` (one, the team's live room) and `ContactChannel` (one per contact, all their tabs/devices). Hibernatable websockets.

D1 is the source of truth. Writes go through REST; the Worker then pushes events to the Durable Objects, which fan them out over websockets. Clients refetch after a reconnect.

## Who can do what

| Caller | Auth | Sees |
|---|---|---|
| Contact (widget, app) | `Authorization: Bearer <session>` from `POST /api/v1/session` | Their own conversations; never internal notes, assignment or priority events, tags, priority or custom fields |
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
| GET | `/bootstrap` | | `BootstrapResponse` (`config.availability`: business hours, see below) |
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
| GET | `/conversations` | `?view=mine\|unassigned\|open\|snoozed\|resolved\|all&q=&cursor=&contactId=&tag=&priority=low\|normal\|high\|urgent&sort=priority` → `Page<AgentConversation>` (`sort=priority`: urgent first, newest first within each) |
| GET | `/conversations/counts` | `InboxCounts` |
| GET | `/conversations/:id` | `AgentConversation` |
| GET | `/conversations/:id/messages` | `?before=` → `Page<Message>` (includes notes and events) |
| POST | `/conversations/:id/messages` | `AgentSendMessageInput` (`kind: "text"\|"note"`); first reply auto-assigns |
| PATCH | `/conversations/:id` | `{ status?, snoozedUntil?, assigneeId?, priority?, customFields? }`; `customFields` (`{ key: value \| null }`) merges, null clears; a priority change adds an internal event |
| POST | `/conversations/:id/tags` | `{ tagId }` or `{ name, color? }` (created when missing) → `AgentConversation`; no timeline event |
| DELETE | `/conversations/:id/tags/:tagId` | → `AgentConversation` |
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
| GET/PUT | `/settings` | `AdminSettings` (PUT owner, partial; `helpCenter: { enabled, title, description? }`) |
| POST | `/settings/webhook-secret` | owner; `{ secret }` shown once |
| GET/POST | `/tags` | `{ items: TagWithUsage[] }` (with total and open counts); POST `{ name, color }`, any teammate |
| PATCH/DELETE | `/tags/:id` | owner; `{ name?, color? }` (palette: `TAG_COLORS`); delete removes it from every conversation |
| GET/POST | `/conversation-fields` | `{ items: ConversationField[] }`; POST owner `{ key, label, type: text\|number\|select\|checkbox\|date, options? }` |
| PATCH/DELETE | `/conversation-fields/:id` | owner; `{ label?, options? }` (key and type are fixed); delete clears its values everywhere |
| POST | `/conversation-fields/reorder` | owner; `{ ids }` (every field, in the new order) |
| GET | `/conversations/:id/messages/:messageId/email` | `EmailOriginal`: the whole inbound email as text, sender checks |
| GET/PATCH | `/email` | `EmailChannelSettings` (PATCH owner; session only) |
| POST | `/email/test` | owner; sends a test email to yourself → `EmailTestResult` |
| GET/POST | `/canned-responses` | `{ shortcut, title, body }` |
| PUT/DELETE | `/canned-responses/:id` | |
| GET | `/ws` | websocket → `AgentServerEvent` frames |
| GET | `/push/public-key` | `{ publicKey }` (VAPID, base64url); created on first call |
| GET/PUT | `/push/preferences` | `PushSettings` / partial `PushPreferences` (mine) |
| POST | `/push/subscriptions` | `PushSubscriptionInput` (this device; idempotent, max 10 devices each) |
| DELETE | `/push/subscriptions` | `{ endpoint }` |
| POST | `/push/test` | `{ endpoint }` → `{ outcome, status }` (sends to that device of mine) |

Websocket client frames: `{ type: "typing", conversationId, isTyping }`, `{ type: "visibility", visible }` (is the tab on screen; sent on connect and on every change) and `{ type: "ping" }` (answered with `{"type":"pong"}`; send every ~25 s).

### Files
`GET /api/files/:id?exp&sig` — signed, expiring links (12 h). Images (png/jpeg/gif/webp) inline, everything else as a download; served with a sandbox CSP and `nosniff`. Uploads are checked against magic bytes.

## Push notifications (teammates)

Web Push straight from the Worker, no third-party service and no configuration (`apps/server/src/lib/web-push.ts`, `lib/push/`):
- **Keys.** On first need the server generates an ECDSA P-256 VAPID key pair (WebCrypto). The public key and the private scalar, sealed with the secret box (`SESSION_SECRET`, bound to the public key), live in `settings` under `push.vapid`. If `SESSION_SECRET` changes the old key can't be opened: a new one is made, all subscriptions are dropped, and dashboards resubscribe on their next load.
- **Sending.** Payloads are encrypted per RFC 8291 (`aes128gcm`, ECDH P-256 + HKDF; checked against the RFC's test vector) and signed per RFC 8292 (`Authorization: vapid t=<ES256 JWT>, k=<public key>`), with `TTL` 24 h, `Urgency: high` and `Topic` = conversation id. Sent from `ctx.waitUntil`, never blocking the request; redirects are not followed. 404/410 delete the subscription; anything else that isn't 2xx counts a failure, and 5 in a row delete it.
- **Subscriptions** (`push_subscriptions`): one row per device, unique endpoint, owned by the signed-in teammate (session only; API keys get 403). Endpoints must be `https` on a public name (no IPs, ports, credentials, local/private names, nor this server).
- **Events** (`agents.push_preferences`, all on by default): a new unassigned conversation (skipped while the AI assistant will answer it), a customer message in a conversation assigned to me, a conversation assigned to me, and an assistant handoff (to the assignee, else everyone). Never to the person who acted, never to bots or disabled teammates, and never to a teammate who has a dashboard tab open and visible (`InboxHub.visibleAgentIds()`, fed by the `visibility` frames). Notes never trigger a push.
- **Payload**: `{ title, body, tag, url }` — the contact's name (or email) and a one-line preview of at most 120 characters; `tag` is the conversation id so updates replace each other.
- **Dashboard.** Installable (`/manifest.webmanifest`, `display: standalone`). `/sw.js` (scope `/`, `no-cache`) only shows notifications and, on click, focuses an open dashboard tab and opens the conversation in it (or opens a new window). It caches nothing. Permission is asked only when the teammate clicks "Turn on" in Settings → Profile → Notifications; iPhone/iPad need the dashboard added to the Home Screen first. Signing out turns push off on that device.

## Widget embedding

`/widget.js` (loader, no dependencies) injects one iframe pointing at `/widget/`. The iframe's `frame-ancestors` CSP only lists `ALLOWED_ORIGINS` + the origins saved in Settings. Host ↔ iframe talk over `postMessage` with origin checks.

## Business hours

Settings → Business hours (owners): `businessHours` `{ enabled, timezone (IANA), week: [{ day 0–6 (Sunday = 0), ranges: [{ from, to }] }], holidays: ["YYYY-MM-DD"] }` and `awayMessage` (en/fr, empty = the default copy in `strings.ts`). PUT `/settings` checks it all (known zone, `HH:MM` from 00:00 to 24:00, from < to, no overlaps, at most 3 ranges a day and 100 holidays) and stores it sorted. Off = always open.

- The time maths is pure and shared, in `packages/protocol/src/business-hours.ts`: `isOpenAt` and `nextOpening` read the hours in the team's zone with `Intl.DateTimeFormat` (no date library), including clock changes (a range starting in the skipped hour opens when the clocks jump; going back into a range reopens it).
- The server decides. `config.availability` `{ open, nextOpenAt }` is computed for each bootstrap (the web messenger refetches it on reconnect, the React Native SDK too). Messengers only format `nextOpenAt` in the customer's own zone and language ("We're away — back tomorrow at 09:00"), so they never need time-zone support from the JS engine (Hermes included). Once `nextOpenAt` has passed they show the usual reply time again.
- **Away message:** when a customer writes while closed, the conversation goes to people (no assistant answering it) and no teammate has replied since closing, the server posts one `away` event (`{ message, backAt }`, visible to the customer) per conversation per closed period. `conversations.away_notified_at` (migration 0007) holds when it was sent: it is sent again only once the team has been open since then, and claimed with a compare-and-set so two messages at once post it once.
- If the assistant hands off while closed, the `handed_off` marker carries `backAt` (the customer reads "We're away right now — back …") and counts as the away message.
- The dashboard shows "Outside business hours" in the inbox header while closed.

## Help center

Public, server-rendered web pages for the knowledge base (`apps/server/src/help-center`), on when **Settings → Assistant → Help center** is switched on (`helpCenter.enabled`; off answers 404).

| Path | Page |
|---|---|
| `/help` | 302 to `/help/en` or `/help/fr` from `Accept-Language` |
| `/help/:locale` | Title, description, search box, recently updated, categories with their articles |
| `/help/:locale/:slug` | One article (Markdown), breadcrumb, more in its category |
| `/help/:locale/search?q=` | Full-text search (`knowledge_fts`, query cut to 200 chars, only letters/digits kept, each word quoted) |
| `/help/sitemap.xml`, `/robots.txt` | Every published page; robots allows `/help` only (served while the help center is on) |

- **What shows:** knowledge items with `published = 1`, in the page's language or for every language (`locale` NULL). New FAQ entries start published, articles private. Each item has a `slug` (unique per language; an every-language item's slug must be free in all languages), an optional `category`, a `position` and a `translation_group` (items in one group are translations: hreflang links + the language switcher). Slugs of items created before 0.7.0 are filled on first use, in creation order.
- **Markdown** goes through markdown-it with `html: false`: raw HTML shows as text, links and images keep only http(s)/mailto, links leaving the site get `rel="noopener nofollow ugc"`.
- **Security headers:** strict CSP (`default-src 'none'`, scripts only from this origin, the one inline stylesheet allowed by its sha256), `frame-ancestors 'none'`, `nosniff`.
- **Caching:** `public, max-age=60, stale-while-revalidate=300` with a weak ETag built from the settings' and the knowledge's `updated_at` (and item count), so a change is visible within a minute and unchanged pages answer 304.
- **"Still need help? Chat with us"** shows only when the page's origin may embed the messenger (`ALLOWED_ORIGINS` + Settings → Install) and anonymous visitors may chat. The page then loads `/help/assets/chat.js` (boots the messenger and opens it on click) and `/widget.js`.
- **Messenger:** `GET /api/v1/help` items carry `helpCenterUrl` when the help center is on and the entry is published ("Open in the help center" in the web messenger and the React Native SDK).

## Integrations (API keys, webhook endpoints)

See [INTEGRATIONS.md](INTEGRATIONS.md). In short:
- `Authorization: Bearer ydk_…` on `/api/agent/*`. The key acts as its bot teammate, the scopes are checked against a deny-by-default route list (`apps/server/src/lib/api-keys.ts`), and there is no cookie, so no CSRF check. Owners manage keys at `/api/agent/api-keys` (session only).
- Events go to the Settings webhook and to every enabled endpoint that subscribed (`apps/server/src/lib/webhooks.ts`). Endpoint deliveries are logged in `webhook_deliveries`, retried by the every-minute cron for about 3 days, and kept 30 days.
- OpenAPI 3.1 at `/api/openapi.json` (`apps/server/src/openapi.ts`).

## Webhooks

`POST <url>` with `{ id, event, createdAt, data }` and `X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256("<t>.<body>")>` (one `v1` per active secret while a secret is being rolled). Events: `conversation.created`, `message.created`, `conversation.updated` (status, assignee, priority, tags or custom fields), `conversation.rated`, `conversation.unread_reply` (a reply unread for 2 minutes — send the push notification from here). `conversation.created` and `conversation.updated` carry `priority`, `tags` (names) and `customFields`.

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
