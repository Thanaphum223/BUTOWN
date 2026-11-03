# Gov Center as TownTrack's identity provider

Reference: https://library.govcenter.co/sso (checked 2026-11-03).

TownTrack is an E-Service. Gov authenticates the person; TownTrack retains its own authorization, complaints and HttpOnly session. A profile viewer is not the authentication mechanism.

## Verified code contract

Gov issues a single-use code and returns it to the registered TownTrack `/auth/callback`, with the initiating state. The browser sends this code and state to TownTrack. The backend consumes the server-bound state once and calls `POST <IAM_API_URL>/e-services/sso/verify-code` with `{code}` and the server-only `x-api-key`. Only the verified response supplies the IAM identity and residence data. The browser must never supply a trusted identity, role, API key or central access token.

New identities receive CITIZEN. Existing local accounts are linked only by an explicit authenticated LINK operation. Local roles, passwords and department assignments remain authoritative; never merge accounts by matching a name/email.

## Login initiation and existing central login

TownTrack first checks its own `/api/auth/me` session. If absent, it shows the sign-in screen. One click on the Gov Center button calls `GovSsoClient.getLoginUrl()` and embeds that same generated state into the callback query and records it with TownTrack's CSRF-protected `/api/auth/gov/start` before navigating to the documented Gov login URL. LINK uses the same flow from an authenticated local account. Failed start stays on TownTrack and restores the local form.

The guide documents the one-time-code redirect/verify flow, not a browser `/auth/session` endpoint. TownTrack therefore does not call that endpoint, use an opaque session token, or inspect another origin's cookies. Gov Center controls reuse of its existing login when this documented authorization flow starts. A provider session should return an E-Service code to `/auth/callback`; landing on Gov's own dashboard without a callback is not a successful TownTrack login.

After a verified callback, TownTrack creates its own HttpOnly session, refreshes CSRF and reloads its own `/` (whose default view is the dashboard). It never explicitly navigates to `auth.govcenter.co/dashboard`. Logout remains on TownTrack until the user initiates sign-in again. One-use exchanges are never automatically retried.

The reference screenshots illustrate the authorization concept. They do not replace Gov Center's documented API with `/connect/authorize`, `/connect/token` or `/connect/userinfo`. The service API key stays on the backend; the verified `user` and `residences` arrive together from `verify-code`.

## Observed LINE return behavior and domain restriction (2026-11-03)

A fresh real LINE login completed authentication but ended on `https://auth.govcenter.co/dashboard`. Before LINE authentication, its authorization request already carried the central callback with `/dashboard`, instead of TownTrack's requested callback. This is not evidence that the TownTrack callback ran and failed.

The public Gov LoginForm script `https://auth.govcenter.co/_next/static/chunks/39e2ec54ec4bec6a.js?dpl=e954af0` normalizes callback/redirect values against an external-host list of `govcenter.co`, `gov.co`, their subdomains and loopbacks. It rejects `towntrack.201.79.98.199.sslip.io` and falls back to `/dashboard`. Changing TownTrack's callback path from `/auth/callback` to `/` does not change this host rejection. A registered Website URL by itself does not override this observed frontend filter. Ask Gov to approve the exact TownTrack hostname in the supported redirect validation, or provide a TownTrack domain that the provider approves. Do not bypass the filter, weaken validation or use an unrelated allowed host.

That same LoginForm and the public Gov callback script `https://auth.govcenter.co/_next/static/chunks/278ced2a7c939247.js?dpl=e954af0` append code/service/is_new_user to a new URL constructed from the callback, but do not copy the initial top-level state. TownTrack now includes its existing random state in the callback query as well as the outer login query, so it survives the documented code return without trusting a browser profile or dropping state validation. The callback still has to match both browser storage and the initiating server session.

TownTrack accepts `/auth/callback`, `/auth/callback/` and a root Website URL carrying a code. The root receiver excludes direct LINE/LIFF login markers and still rejects missing/invalid state. It clears the credential query, verifies the code once, refreshes CSRF and reloads `/` fully; a hash-only navigation at the root would otherwise leave the callback screen mounted. All three landing paths suppress frontend access logs to keep codes out of request logs. This root compatibility is not a workaround for the upstream hostname restriction.

## Provider information still needed for live acceptance

- Confirm TownTrack's exact registered service code and the user's service access; the current public code is `town-track`.
- Confirm the registered callback `https://towntrack.201.79.98.199.sslip.io/auth/callback` is honored after central authentication, rather than sending this E-Service request to `/dashboard`.
- Verify that the documented login flow returns a fresh code and the original state, including when the user already has a central login.
- Complete one real login and prove verified user data reaches TownTrack, then verify the same IAM identity reuses its existing local account.

No local change can read another origin's HttpOnly cookie or turn an API key into a user's authenticated session. Keep keys in the server environment and out of Git/frontend storage. Do not enable mandatory central authentication until live acceptance succeeds and an administrator account is safely linked.
