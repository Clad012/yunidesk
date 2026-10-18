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

- **D1** `yunidesk` (`--jurisdiction eu`): agents, sessions, invites, contacts, conversations, messages (+ FTS5), attachments, settings, saved replies. Schema: `apps/server/migrations`.
- **R2** `yunidesk-files` (`jurisdiction: eu`): attachments (private, served through signed links) and team avatars (public).
- **Durable Objects** (`DATA_JURISDICTION=eu`): `InboxHub` (one, the team's live room) and `ContactChannel` (one per contact, all their tabs/devices). Hibernatable websockets.

D1 is the source of truth. Writes go through REST; the Worker then pushes events to the Durable Objects, which fan them out over websockets. Clients refetch after a reconnect.

## Who can do what

| Caller | Auth | Sees |
|---|---|---|
| Contact (widget, app) | `Authorization: Bearer <session>` from `POST /api/v1/session` | Their own conversations; never internal notes or assignment events |
| Teammate (dashboard) | `__Host-ys_session` cookie (HttpOnly, Secure, SameSite=Strict) + Origin check on writes and websockets; password or single sign-on | Everything their role allows (below) |
| Host backend | — | Signs identity tokens with `IDENTITY_SECRET`; receives signed webhooks |

**Identity verification.** Signed-in users are identified by a short-lived HS256 token your backend signs with `IDENTITY_SECRET` (`signUserToken` from `yunidesk/identity`). Without a valid token a caller can only be an anonymous visitor (if allowed in settings). Anonymous visitors keep a 180-day visitor token in the widget's own storage.

### Roles

One table, `packages/protocol/src/permissions.ts` (`can(role, action)`), used by the server (`apps/server/src/lib/permissions.ts` → `requirePermission`) and by the dashboard, which hides what a role can't do.

| | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Read inbox, contacts, teammates, saved replies; edit own profile | ✓ | ✓ | ✓ | ✓ |
| Reply, notes, attachments (`inbox.reply`); assign, snooze, resolve, mark read (`inbox.update`) | ✓ | ✓ | ✓ | |
| Saved replies (`savedReplies.manage`) | ✓ | ✓ | ✓ | |
| Export / erase contacts (`contacts.export`, `contacts.erase`) | ✓ | ✓ | | |
| Settings, API keys, webhooks, assistant, audit log | ✓ | ✓ | | |
| Invite, change and disable non-owners (`team.manage`) | ✓ | ✓ | | |
| Make, change, disable or invite owners (`team.manageOwners`); single sign-on (`sso.manage`) | ✓ | | | |

Team rules (`checkMemberChange`): there is always at least one active owner, only owners touch owners, nobody disables themselves. A role change or a disable closes that person's live sockets; pending invites go when their sender loses the right to send them. Viewers' typing signals are dropped by `InboxHub`.

API keys don't have roles: the key's scopes, checked against the deny-by-default route list in `apps/server/src/lib/api-keys.ts`, are the only gate (its bot teammate's role plays no part). `/audit-log` and `/sso` are session only.

### Audit log

`audit_log` (migration `0010`) records sign-ins (success and failure, with the email but never the password), sign-outs, SSO sign-ins and refusals (with a reason), settings changes (which keys, never values), team invites, role changes and disables, API keys, webhook endpoints, assistant settings / knowledge / tools, contact export and erasure (the contact id only), and saved replies. `audit(c, action, target, details)` (`apps/server/src/lib/audit.ts`) writes after the response with `waitUntil` and never fails the request. Actions are listed in `AUDIT_ACTIONS` (`packages/protocol/src/types.ts`). Entries older than `auditRetentionDays` (default 365, at least 30) are purged daily.

### Single sign-on (OpenID Connect)

Owners configure it in Settings → Single sign-on (stored under the `sso` settings key; the client secret is sealed with `secret-box` and never returned). `GET /api/agent/auth/sso/start` reads the provider's discovery document (cached an hour), puts `state`, `nonce` and a PKCE (S256) verifier in a 10-minute signed `__Host-ys_sso` cookie (HttpOnly, SameSite=Lax) and redirects to the provider. `GET /api/agent/auth/sso/callback` (rate-limited with `AUTH_LIMITER`) checks the state, exchanges the code (`client_secret_basic`, or `client_secret_post` when that's all the provider offers), and verifies the ID token with WebCrypto against the provider's JWKS (`apps/server/src/lib/sso/id-token.ts`: RS256/ES256 only, key by `kid`, `iss`, `aud`/`azp`, `exp`/`iat` with 60 s skew, `nonce`). The email must be verified (`email_verified`, or Entra's `xms_edov`) and in an allowed domain. Then: the teammate with that email (refused if disabled), else a pending invite for it, else a new teammate with the configured role, or a refusal (invite only). Success starts the normal session; every failure is audited and lands on `/login?sso_error=<code>`. "Require SSO" refuses password sign-in and password invite acceptance for everyone but owners (their break-glass) and signs out non-owners once when turned on.

**Secrets** (`wrangler secret put`): `SESSION_SECRET`, `IDENTITY_SECRET`, `SETUP_TOKEN` (first owner only), optional `RESEND_API_KEY` + `EMAIL_FROM`.

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
| GET | `/auth/status` | `AuthStatus`: `{ needsSetup, sso: { enabled, required } }` |
| POST | `/auth/setup` | `{ setupToken, name, email, password }` → first owner |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| GET | `/auth/sso/start` | browser navigation → identity provider |
| GET | `/auth/sso/callback` | provider redirect URI → dashboard or `/login?sso_error=` |
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
| GET | `/contacts/:id/export` | `contacts.export`; JSON download (GDPR access) |
| DELETE | `/contacts/:id` | `contacts.erase`; erases contact, messages, files (GDPR erasure) |
| PATCH | `/me` | `{ name?, currentPassword?, newPassword? }` |
| POST | `/me/avatar` | multipart `file` (png/jpeg/webp ≤ 2 MB) |
| GET | `/team` | `{ agents: (Agent & { disabled })[], invites: Invite[] }` |
| POST | `/team/invites` | `team.manage` (owner invites: owners); `{ email, role }` → `{ id, url }` (link shown once) |
| DELETE | `/team/invites/:id` | `team.manage` |
| PATCH | `/team/:id` | `team.manage`; `{ role?, disabled? }`, team rules above |
| GET/PUT | `/settings` | `AdminSettings` (PUT `settings.manage`, partial) |
| POST | `/settings/webhook-secret` | `settings.manage`; `{ secret }` shown once |
| GET | `/audit-log` | `auditLog.read`; `?cursor=&action=<action or group>&actor=<id>` → `Page<AuditEntry>` |
| GET | `/audit-log/export` | `auditLog.read`; same filters, newest 10,000 as CSV |
| GET/PUT | `/sso` | `sso.manage`; `SsoSettings` / `SsoSettingsPatch` (`clientSecret` write-only) |
| POST | `/sso/test` | `sso.manage`; `{ issuer? }` → the provider's discovery endpoints |
| GET/POST | `/canned-responses` | `{ shortcut, title, body }` (POST `savedReplies.manage`) |
| PUT/DELETE | `/canned-responses/:id` | `savedReplies.manage` |
| GET | `/ws` | websocket → `AgentServerEvent` frames |

Websocket client frames: `{ type: "typing", conversationId, isTyping }` and `{ type: "ping" }` (answered with `{"type":"pong"}`; send every ~25 s).

### Files
`GET /api/files/:id?exp&sig` — signed, expiring links (12 h). Images (png/jpeg/gif/webp) inline, everything else as a download; served with a sandbox CSP and `nosniff`. Uploads are checked against magic bytes.

## Widget embedding

`/widget.js` (loader, no dependencies) injects one iframe pointing at `/widget/`. The iframe's `frame-ancestors` CSP only lists `ALLOWED_ORIGINS` + the origins saved in Settings. Host ↔ iframe talk over `postMessage` with origin checks.

## Integrations (API keys, webhook endpoints)

See [INTEGRATIONS.md](INTEGRATIONS.md). In short:
- `Authorization: Bearer ydk_…` on `/api/agent/*`. The key acts as its bot teammate, the scopes are checked against a deny-by-default route list (`apps/server/src/lib/api-keys.ts`), and there is no cookie, so no CSRF check. Owners and admins manage keys at `/api/agent/api-keys` (session only).
- Events go to the Settings webhook and to every enabled endpoint that subscribed (`apps/server/src/lib/webhooks.ts`). Endpoint deliveries are logged in `webhook_deliveries`, retried by the every-minute cron for about 3 days, and kept 30 days.
- OpenAPI 3.1 at `/api/openapi.json` (`apps/server/src/openapi.ts`).

## Webhooks

`POST <url>` with `{ id, event, createdAt, data }` and `X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256("<t>.<body>")>` (one `v1` per active secret while a secret is being rolled). Events: `conversation.created`, `message.created`, `conversation.updated`, `conversation.rated`, `conversation.unread_reply` (a reply unread for 2 minutes — send the push notification from here).

## Jobs (cron)
- every minute: retry due webhook deliveries
- every 5 min: wake snoozed conversations
- daily: purge unsent uploads (1 day), resolved conversations older than `retentionDays`, silent anonymous visitors (30 days), webhook delivery logs (30 days), audit log entries older than `auditRetentionDays`, expired sessions/invites

## Local development
```
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars
pnpm --dir apps/server db:migrate:local
pnpm dev          # server :8787, dashboard :5173, widget :5174
```
Open http://localhost:5173/setup with the `SETUP_TOKEN` from `.dev.vars`.
