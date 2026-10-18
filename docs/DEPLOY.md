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

## 5. Single sign-on (optional)

Settings → Single sign-on (owners) shows the **redirect URI** to register: `https://support.example.com/api/agent/auth/sso/callback`. Create an OpenID Connect web application at your provider with that redirect URI and the `openid email profile` scopes, then paste the issuer URL, client ID and client secret, add your email domain(s), press **Test connection**, turn it on and save. Owners can always sign in with their password, even with "Require SSO" on, so keep one owner with a known password.

- **Google Workspace** — Google Cloud console → APIs & Services → Credentials → Create OAuth client ID → *Web application*; add the redirect URI. Set the OAuth consent screen to *Internal* so only your Workspace can use it. Issuer: `https://accounts.google.com`.
- **Microsoft Entra ID** — Entra admin center → App registrations → New registration (single tenant), redirect URI of type *Web*. Certificates & secrets → New client secret. Token configuration → Add optional claims (ID token): `email` and `xms_edov` (the verified-domain flag Yunidesk accepts instead of `email_verified`). Issuer: `https://login.microsoftonline.com/<tenant id>/v2.0` (not `common`).
- **Okta** — Applications → Create App Integration → *OIDC* → *Web Application*; sign-in redirect URI as above; assign the people or groups. Issuer: `https://<your org>.okta.com` (org server) or `https://<your org>.okta.com/oauth2/default`.
- **Authentik / Keycloak** — an OAuth2/OpenID provider (Authentik) or a confidential OpenID Connect client (Keycloak) with the redirect URI; the issuer is the provider's `…/application/o/<slug>/` (Authentik) or `…/realms/<realm>` (Keycloak) URL.

"People without an account": *Invite only* lets in only existing teammates and people with a pending invite (they get the invite's role); otherwise new people from the allowed domains join as agents or viewers.

## 6. Connect your app

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
