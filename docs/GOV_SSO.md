# Gov Center as TownTrack's identity provider

Reference: https://library.govcenter.co/sso (checked 2026-11-03).

TownTrack is an E-Service. Gov authenticates the person; TownTrack retains its own authorization, complaints and HttpOnly session. A profile viewer is not the authentication mechanism.

## Verified code contract

Gov issues a single-use code and returns it to the registered TownTrack `/auth/callback`, with the initiating state. The browser sends this code and state to TownTrack. The backend consumes the server-bound state once and calls `POST https://api-auth.govcenter.co/e-services/sso/verify-code` with `{code}` and the server-only `x-api-key`. The live endpoint returns HTTP 201 on successful verification, while the published OpenAPI lists HTTP 200. TownTrack accepts these two success statuses and validates the same required user schema for both; other statuses never authenticate. Only the verified response supplies the IAM identity and residence data. The browser must never supply a trusted identity, role, API key or central access token.

New identities receive CITIZEN. Existing local accounts are linked only by an explicit authenticated LINK operation. Local roles, passwords and department assignments remain authoritative; never merge accounts by matching a name/email.

## Login initiation and existing central login

TownTrack first checks its own `/api/auth/me` session. If absent, it shows the sign-in screen. One click on the Gov Center button uses `GovSsoClient.getLoginUrl()` to generate/store a nonce, records it with TownTrack's CSRF-protected `/api/auth/gov/start`, then opens Gov's published LINE authorization flow. Its fixed LINE channel is `2008946775`, its LINE redirect is `https://api-auth.govcenter.co/auth/line/callback`, and its scopes are `profile openid email`. LINE state contains the configured TownTrack callback with a transaction `state` query plus the configured service code. Neither destination nor service is taken from incoming browser parameters. LINK uses the same flow from an authenticated local account. Failed start stays on TownTrack and restores the local form.

The guide documents the one-time-code redirect/verify flow, not a browser `/auth/session` endpoint. TownTrack therefore does not call that endpoint, use an opaque session token, or inspect another origin's cookies. Gov Center controls reuse of its existing login when this documented authorization flow starts. A provider session should return an E-Service code to `/auth/callback`; landing on Gov's own dashboard without a callback is not a successful TownTrack login.

After a verified callback, TownTrack creates its own HttpOnly session, refreshes CSRF and reloads its own `/` (whose default view is the dashboard). It never explicitly navigates to `auth.govcenter.co/dashboard`. Logout remains on TownTrack until the user initiates sign-in again. One-use exchanges are never automatically retried.

The reference screenshots illustrate the authorization concept. They do not replace Gov Center's documented API with `/connect/authorize`, `/connect/token` or `/connect/userinfo`. The service API key stays on the backend; the verified `user` and `residences` arrive together from `verify-code`.

## Direct Gov LINE return

The public Gov frontend normalizes external hosts and sent the registered sslip.io callback to its own dashboard. TownTrack now starts the existing Gov backend LINE flow directly using the same published channel, backend redirect and scopes. The official OpenAPI at https://api-auth.govcenter.co/api-json documents `/auth/line/callback` as returning a one-time ticket and an SSO code when applicable. It also documents service ownership, expiry, single use and disabled-service checks at `/e-services/sso/verify-code`.

The configured/registered callback remains `https://towntrack.201.79.98.199.sslip.io/auth/callback`. Each authorization adds only its generated transaction nonce to that destination query. Gov must preserve this exact nonce on the return. Browser storage is never substituted for a missing return value. Both browser and server must match it; the server consumes its pending request once, before network verification.

Before dynamically loading the app or fetching config, the entrypoint captures only `code`, `state`, `service` and a sanitized error, then removes the entire callback query and fragment. An accompanying IAM ticket is never exchanged, decoded, persisted or forwarded. Parent IAM tokens, explicit errors, new-user/onboarding flags, duplicate critical parameters and mismatched service values fail closed. Accounts needing Gov onboarding must finish that supported registration before retrying; TownTrack does not use the ticket to perform onboarding.

The receiver accepts `/auth/callback`, `/auth/callback/` and a root Website URL carrying a code, excluding direct TownTrack LINE/LIFF markers. After a verified code it refreshes CSRF and fully reloads TownTrack `/`. Local logout does not silently authenticate again. HTML is served with no-store/no-referrer, and callback access logs are disabled; Caddy has no access logging enabled. Do not enable full-query callback logging or add analytics before cleanup.

## Live acceptance checks

Automated browser tests exercise the URL/nonce contract, early cleanup, provider error/onboarding handling, duplicates, code-only exchange, local logout and explicit linking. They do not establish provider compatibility by themselves. Live acceptance requires a normal authorized LINE login returning the unchanged transaction nonce and a scoped code, successful verification with TownTrack's own server API key, and a visible TownTrack session/profile. Repeat login must reuse the same IAM identity; invalid/replayed pending requests must fail. A Gov dashboard or local spinner alone is not success.

This route creates TownTrack's session. It does not claim to create Gov's NextAuth web session or guarantee automatic sign-in to other services. TownTrack never reads another origin's cookies or treats an API key as a user's login.

## Three environment settings

Only `E_SERVICE_API_KEY`, `E_SERVICE_CODE` and `GOV_CALLBACK_URL` configure the Gov integration. Official Gov auth/API URLs are fixed constants from the guide. Legacy endpoint/mode/municipality environment overrides are no longer read. LOGIN resolves the single municipality in TownTrack's own database at start and binds it to the pending request. Zero/multiple municipalities reject anonymous LOGIN clearly. LINK uses the authenticated account's own municipality and checks it again before exchange. No central municipality ID is required or trusted as a local tenant ID.
