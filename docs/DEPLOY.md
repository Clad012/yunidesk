# Deploying Yunidesk

Everything runs in your own Cloudflare account. With `--jurisdiction eu` (below) data stays in the EU.

## 1. Create the resources (once)

```bash
cd apps/server
npx wrangler d1 create yunidesk --jurisdiction eu        # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create yunidesk-files --jurisdiction eu
```

Leave out `--jurisdiction eu` (and set `DATA_JURISDICTION` to empty) if you don't need EU pinning.

## 2. Secrets

```bash
npx wrangler secret put SESSION_SECRET     # openssl rand -base64 48
npx wrangler secret put IDENTITY_SECRET    # openssl rand -base64 48 — your app backend signs identity tokens with it
npx wrangler secret put SETUP_TOKEN        # any long random string; only used once
# optional, emails anonymous visitors about unread replies
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM         # e.g. Acme Support <support@example.com>
```

Do **not** set `DEV_ORIGINS` or `ENVIRONMENT=development` in production.

In `wrangler.jsonc` → `vars`:
- `ALLOWED_ORIGINS`: sites that may embed the widget, e.g. `https://example.com,https://www.example.com` (more can be added from Settings → Install).
- `DATA_JURISDICTION`: `eu` when the resources were created with `--jurisdiction eu`.
- `PUBLIC_URL`: e.g. `https://support.example.com`, once the custom domain is set.

**Push notifications for your team** need no setup: the server makes its own VAPID key pair the first time someone turns them on (Settings → Profile → Notifications) and keeps the private key encrypted with `SESSION_SECRET`. Changing `SESSION_SECRET` later makes a new key; every device then has to turn notifications on again (the dashboard does it by itself on the next visit). On iPhone and iPad, teammates first add the dashboard to the Home Screen.

Keeping your real ids and domain out of git: copy `wrangler.jsonc` to `wrangler.production.jsonc` (gitignored), fill it in, and deploy with `pnpm run deploy:production`.

## 3. Deploy

```bash
pnpm run deploy               # builds dashboard + widget, applies D1 migrations remotely, wrangler deploy
pnpm run deploy:production    # same, with apps/server/wrangler.production.jsonc
```

(`pnpm deploy` without `run` is a different, built-in pnpm command.)

Add a custom domain (e.g. `support.example.com`) to the worker: uncomment `routes` in the config, or use the Cloudflare dashboard.

## 4. First owner

Open `https://support.example.com/setup`, enter the `SETUP_TOKEN`, your name, email and password. Then invite teammates from Settings → Team. Delete the `SETUP_TOKEN` secret afterwards.

## 5. Connect your app

1. **Identity tokens** — in your API, add an authenticated route that returns a token for the signed-in user:
   ```ts
   import { signUserToken } from "yunidesk/identity";
   const token = await signUserToken(
     { userId: user.id, email: user.email, name: user.name, attributes: { plan: "pro" } },
     env.YUNIDESK_IDENTITY_SECRET,       // same value as IDENTITY_SECRET above
     { expiresInSeconds: 3600 },
   );
   ```
2. **Web** — `<Yunidesk baseUrl="https://support.example.com" getUserToken={fetchSupportToken} />` from `yunidesk-react`, and add the web origins to `ALLOWED_ORIGINS`. Without React, use the script tag from Settings → Install.
3. **Mobile** — wrap the app in `<SupportProvider baseUrl=... getUserToken=...>` and render `<SupportMessenger />` on a screen (`yunidesk-react-native`).
4. **Push for unread replies** — Settings → Webhooks: set your API URL, generate the secret, and send a push on `conversation.unread_reply` (`data.contact.externalId` is your user id). Verify `X-Yunidesk-Signature` with `verifyWebhookSignature` from `yunidesk/webhooks` before trusting a call.

## Smoke test after a deploy

`/api/health` returns `{ "ok": true }`; open the dashboard, open the widget on an allowed site, send a message, answer it from the dashboard.
