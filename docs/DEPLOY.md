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

### Help center on its own domain (optional)

The help center works on the main domain at `/help` (e.g. `https://support.example.com/help`). To serve it from `help.example.com` too, add that domain to the same worker (another `routes` entry with `custom_domain: true`); the pages, canonical links and sitemap use the domain they are opened on. For the "Chat with us" button there, add `https://help.example.com` to the sites allowed to embed the messenger (Settings → Install or `ALLOWED_ORIGINS`).

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

## 6. Email channel (optional)

Customers email `support@example.com`; each email becomes a conversation (channel `email`), your replies go back as emails that thread in their mail client, and their answers land in the same conversation.

**Receiving (Cloudflare Email Routing).** The domain of the support address must use Cloudflare DNS.
1. Dashboard → your domain → Email → Email Routing → enable it (it adds the MX and SPF records).
2. Settings → turn on **subaddressing**, so `reply+<token>@example.com` matches the `reply@` rule.
3. Routing rules → **Custom address** `support@example.com` → action **Send to a Worker** → `yunidesk`. Add a second rule for `reply@example.com` → the same worker. (A catch-all to the worker works too: unknown addresses are refused.)
4. Set the address: `EMAIL_INBOUND_ADDRESS` in `wrangler.jsonc` → `vars`, or Settings → Email in the dashboard. Turn the channel on there.

Emails over 10 MB are refused, at most 5 attachments are imported per email (the upload rules apply: same types, 10 MB each), and one sender may send 20 emails an hour. Auto-replies, bounces and mailing-list mail are ignored.

**Who sent it.** The From header of an email proves nothing. Email Routing checks SPF, DKIM and DMARC and records the result in `Authentication-Results` (authserv-id `mx.cloudflare.net`; set `EMAIL_AUTHSERV_ID` if yours differs). Only when DMARC (or DKIM aligned with the From domain) passes does an email join an existing contact or continue a conversation by its headers. Other emails are still accepted, marked **Unverified sender** in the inbox, and never merged into a contact your app identified.

**Sending replies.** Pick one (Settings → Email → Sending provider; `auto` prefers Cloudflare):
- **Cloudflare Email Service** — onboard the domain of your from address (`npx wrangler email sending enable example.com`, or Dashboard → Email → Email Sending), then uncomment `"send_email": [{ "name": "SEND_EMAIL" }]` in `wrangler.jsonc` and deploy.
- **Resend** — `RESEND_API_KEY` (and `EMAIL_FROM`) as above, with your domain verified in Resend.

Replies come from `"<teammate> via <team>" <from address>` with `Reply-To: reply+<token>@<support domain>`; the token is an HMAC of the conversation id (signed with `SESSION_SECRET`), so it can't be guessed. Attachments are sent as links valid for 30 days. Failed sends are retried for about 9 hours (every-minute cron), then the conversation shows "Reply not delivered by email".

**DNS for the from domain**, or replies land in spam:
- **SPF** — one TXT record on the domain, e.g. `v=spf1 include:_spf.mx.cloudflare.net ~all` (add your sending provider's include if it gives one; never two SPF records).
- **DKIM** — the records Cloudflare Email Sending or Resend show you when you add the domain.
- **DMARC** — `_dmarc.example.com` TXT `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com` (start with `p=none` while you check reports).

Then Settings → Email → **Send a test email**, and email the support address from your own mailbox.

Local testing: `wrangler dev` accepts raw emails at `POST /cdn-cgi/handler/email?from=…&to=…` (URL-encode the `+` of reply addresses as `%2B`); add an `Authentication-Results: mx.cloudflare.net; dmarc=pass header.from=<domain>` header to simulate a verified sender. With the `send_email` binding uncommented, local sends are written to `.wrangler/tmp/email/`.

## Smoke test after a deploy

`/api/health` returns `{ "ok": true }`; open the dashboard, open the widget on an allowed site, send a message, answer it from the dashboard.
