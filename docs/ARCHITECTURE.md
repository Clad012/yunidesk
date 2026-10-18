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

- **D1** `yunidesk` (`--jurisdiction eu`): agents, sessions, invites, contacts, conversations, messages (+ FTS5), attachments, settings, saved replies, tags (`tags`, `conversation_tags`), custom field definitions (`conversation_fields`; values in `conversations.custom_fields`), teams (`teams`, `team_members`, `conversations.team_id`, teammate `availability` and `max_open` on `agents`) and assignment rules (`assignment_rules`; the fallback in `settings` under `assignment`). Schema: `apps/server/migrations`.
- **R2** `yunidesk-files` (`jurisdiction: eu`): attachments (private, served through signed links) and team avatars (public).
- **Durable Objects** (`DATA_JURISDICTION=eu`): `InboxHub` (one, the team's live room) and `ContactChannel` (one per contact, all their tabs/devices). Hibernatable websockets.

D1 is the source of truth. Writes go through REST; the Worker then pushes events to the Durable Objects, which fan them out over websockets. Clients refetch after a reconnect.

## Who can do what

| Caller | Auth | Sees |
|---|---|---|
| Contact (widget, app) | `Authorization: Bearer <session>` from `POST /api/v1/session` | Their own conversations; never internal notes, assignment, team or priority events, tags, priority, custom fields or teams |
| Teammate (dashboard) | `__Host-ys_session` cookie (HttpOnly, Secure, SameSite=Strict) + Origin check on writes and websockets | Everything |
| Host backend | — | Signs identity tokens with `IDENTITY_SECRET`; receives signed webhooks |

**Identity verification.** Signed-in users are identified by a short-lived HS256 token your backend signs with `IDENTITY_SECRET` (`signUserToken` from `yunidesk/identity`). Without a valid token a caller can only be an anonymous visitor (if allowed in settings). Anonymous visitors keep a 180-day visitor token in the widget's own storage.

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
| GET | `/auth/status` | `{ needsSetup }` |
| POST | `/auth/setup` | `{ setupToken, name, email, password }` → first owner |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| GET | `/auth/invites/:token` | `{ email, role }` |
| POST | `/auth/invites/:token/accept` | `{ name, password }` |
| GET | `/bootstrap` | `{ agent: Agent, teammates: Teammate[], settings: AdminSettings }` (teammates carry `availability`) |
| GET | `/conversations` | `?view=mine\|unassigned\|open\|snoozed\|resolved\|all&q=&cursor=&contactId=&tag=&team=&priority=low\|normal\|high\|urgent&sort=priority` → `Page<AgentConversation>` (`sort=priority`: urgent first, newest first within each) |
| GET | `/conversations/counts` | `InboxCounts` |
| GET | `/conversations/:id` | `AgentConversation` |
| GET | `/conversations/:id/messages` | `?before=` → `Page<Message>` (includes notes and events) |
| POST | `/conversations/:id/messages` | `AgentSendMessageInput` (`kind: "text"\|"note"`); first reply auto-assigns |
| PATCH | `/conversations/:id` | `{ status?, snoozedUntil?, assigneeId?, priority?, customFields?, teamId? }`; `customFields` (`{ key: value \| null }`) merges, null clears; a priority or team change adds an internal event (a team move keeps the assignee) |
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
| GET/PUT | `/settings` | `AdminSettings` (PUT owner, partial) |
| POST | `/settings/webhook-secret` | owner; `{ secret }` shown once |
| GET/POST | `/tags` | `{ items: TagWithUsage[] }` (with total and open counts); POST `{ name, color }`, any teammate |
| PATCH/DELETE | `/tags/:id` | owner; `{ name?, color? }` (palette: `TAG_COLORS`); delete removes it from every conversation |
| GET/POST | `/conversation-fields` | `{ items: ConversationField[] }`; POST owner `{ key, label, type: text\|number\|select\|checkbox\|date, options? }` |
| PATCH/DELETE | `/conversation-fields/:id` | owner; `{ label?, options? }` (key and type are fixed); delete clears its values everywhere |
| POST | `/conversation-fields/reorder` | owner; `{ ids }` (every field, in the new order) |
| GET/POST | `/teams` | `{ items: Team[] }` (members with availability and open load, open/unassigned counts); POST owner `{ name }` (unique, ignoring case; up to 50) |
| PATCH/DELETE | `/teams/:id` | owner; `{ name }`; delete takes its conversations out of the team (assignees stay) and deletes its rules |
| PUT/DELETE | `/teams/:id/members/:agentId` | owner; add / remove a teammate → `Team` |
| GET/PUT | `/assignment` | `AssignmentSettings` `{ rules, fallback }`; PUT owner, replaces the whole ordered list (up to 50 rules) |
| PATCH | `/assignment/teammates/:id` | owner; `{ maxOpen: 1..1000 \| null }`, a teammate's limit on automatic assignment |
| PUT | `/me/availability` | `{ availability: "available" \| "away" }` → `{ agent }`; broadcast as `{ type: "availability" }` |
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

`POST <url>` with `{ id, event, createdAt, data }` and `X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256("<t>.<body>")>` (one `v1` per active secret while a secret is being rolled). Events: `conversation.created`, `message.created`, `conversation.updated` (status, assignee, priority, tags or custom fields), `conversation.rated`, `conversation.unread_reply` (a reply unread for 2 minutes — send the push notification from here). `conversation.created` and `conversation.updated` carry `priority`, `tags` (names), `customFields`, `teamId` and `team` (its name). Rules route a conversation right after `conversation.created` (whose team is always null); the routing sends `conversation.updated` with a `system` actor.

## Teams and automatic assignment

- A teammate can be in several teams. Each teammate is `available` or `away` (profile menu); away teammates still get messages but are never assigned automatically. Owners can cap how many open conversations a teammate gets automatically (`max_open`).
- **Rules** (Settings → Teams & assignment) are ordered; the first whose conditions all match wins. Conditions: channel (`web`, `app` = iOS/Android, `email`), identified or anonymous contact, has a tag, contact attribute equals a value (as text, ignoring case). The contact's language isn't known to the server, so there is no language condition; match on an attribute your identity token sends instead. Action: move to a team, then assign by `round_robin`, `least_busy` (fewest open assigned conversations, ties to the next in turn) or `none`. Without a match, the fallback either leaves the conversation unassigned or sends it to a default team.
- **When they run** (`apps/server/src/db/routing.ts`): on a new conversation the AI assistant doesn't take, and when the assistant hands one off. Never on a conversation that already has an assignee or a team. They don't wait for tags added later through the API: tags set while the assistant answers do count at hand-off.
- **Race safety:** each team keeps whose turn it was and an `assign_version`. The pick is applied in one D1 batch (one transaction) that compare-and-sets the version and routes the conversation only if it is still unrouted; a writer that lost re-reads and chooses again, so two conversations arriving together never take the same round-robin turn. The choice itself is a pure function (`apps/server/src/lib/assignment.ts`).
- Every change of assignee (a teammate or key, the rules, a first reply) goes through `assignmentChanged` in `db/conversations.ts`, once: hook assignment notifications there. A first reply still assigns an unassigned conversation to the replier, as before.

## Jobs (cron)
- every minute: retry due webhook deliveries
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
