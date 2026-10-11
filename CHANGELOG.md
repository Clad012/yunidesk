# Changelog

## 0.6.0

- **FAQ per language**: knowledge items gain `locale` (`en`, `fr`, or null for every language; migration `0005`). The messenger's Help shows the entries in the customer's language plus those for every language (`GET /api/v1/help?locale=`, `SupportClient.help(locale)`). The dashboard has a Language picker.
- **Readable accent colour** (React Native): `theme.accent` / `theme.onAccent` are the brand colour when it stands out on the screen and the text colour otherwise, so a near-black brand no longer makes "Talk to a human", links, the send button and other brand-coloured text vanish in dark mode. Brand fills (header, your bubbles, avatars) keep the brand.

## 0.5.0

- **Help in the messenger**: the Home screen of the widget and of the React Native SDK shows your FAQ entries with a search box (accents and case ignored, works offline over the loaded list). Tapping one opens the answer, with "Ask a question" underneath. A search with no answer offers to ask the team with the search already typed.
  - Only knowledge items of kind `faq` are shown; `article` items stay for the assistant only.
  - New contact route `GET /api/v1/help`, `SupportClient.help()`, `searchHelp()` and the `HelpArticle` type in `yunidesk`.
  - React Native: `SupportHome` gains `onOpenArticle` (the Help section shows only when it is set; `SupportMessenger` sets it), `onNewConversation` may receive the text to prefill, new `SupportHelpArticle` screen and `SupportConversation.initialText`.
- **No blink when an AI reply finishes**: the server now sends `assistant.status: done` only after the final message went out, and the messenger keeps the finished text until that message replaces it (status `done` on `AssistantDraft`). In the widget the final message no longer fades in again.

## 0.4.0

- **AI assistant**: answers customers first from your knowledge (FAQ entries and articles, full-text search) and your tools (signed https calls to your server), with any OpenRouter model (default `z-ai/glm-5.3-flash`).
  - Replies stream live in the widget and the React Native SDK. Every AI message is labelled and has a **Talk to a human** button that hands the conversation to the team.
  - Limits: per customer, per IP for anonymous visitors, per reply, and a daily USD budget. Anything that stops the assistant hands the conversation to the team.
  - Settings → Assistant in the dashboard, or `yunidesk.assistant.*` in `yunidesk/api` (new scope `assistant:write`).
  - Migration `0004`, binding `ASSISTANT_LIMITER`.

## 0.3.0

- **Event catalogue**: `GET /api/agent/events` (any API key) and `WEBHOOK_EVENT_CATALOG` in `yunidesk/webhooks` describe every event, with names and descriptions in English and French and the fields each carries. `yunidesk.events.list()` in `yunidesk/api`.

## 0.2.0

- **API keys** (Settings → API keys): scoped `ydk_…` keys with a checksum, stored as SHA-256 hashes, shown once, optional expiry, instant revocation. Each key acts as a bot teammate. The routes a key may call are deny-by-default.
- **Webhook endpoints**: several endpoints, each with its own events and signing secret (AES-GCM encrypted at rest). Deliveries are logged, retried with backoff for about 3 days and kept 30 days. Endpoints that keep failing are disabled. Secrets can be rolled with a 24-hour overlap. You can send a test event.
- Webhook payloads gain `id` (for dedupe), `actor`, and a contact summary on `conversation.created` and `message.created`.
- `verifyWebhookSignature` accepts a header carrying several `v1` signatures (secret rolls).
- New `yunidesk/api`: a typed client for the team API with an API key.
- OpenAPI 3.1 description at `/api/openapi.json`.
- `PublicAgent.isBot`.

Server: run the new D1 migration (`0003`) and add the `API_LIMITER` rate-limit binding and the every-minute cron (both in `wrangler.jsonc`).

## 0.1.0

First release.
