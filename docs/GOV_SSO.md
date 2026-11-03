# Gov Center as TownTrack's identity provider

Reference: https://library.govcenter.co/sso (checked 2026-11-03).

TownTrack is an E-Service. Gov authenticates the person; TownTrack retains its own authorization, complaints and HttpOnly session. A profile viewer is not the authentication mechanism.

## Verified code contract

Gov issues a single-use code and returns it to the registered TownTrack `/auth/callback`, with the initiating state. The browser sends this code and state to TownTrack. The backend consumes the server-bound state once and calls `POST <IAM_API_URL>/e-services/sso/verify-code` with `{code}` and the server-only `x-api-key`. Only the verified response supplies the IAM identity and residence data. The browser must never supply a trusted identity, role, API key or central access token.

New identities receive CITIZEN. Existing local accounts are linked only by an explicit authenticated LINK operation. Local roles, passwords and department assignments remain authoritative; never merge accounts by matching a name/email.

## Reusing an existing central login

TownTrack first checks its own session. Without one it makes one bounded optional credentialed request to `/auth/session?service=<E_SERVICE_CODE>` on `IAM_GOV_FRONTEND_URL`, a helper endpoint present in installed gov-sso-login1.4.0. If the provider returns an explicit single-use `code`, TownTrack exchanges it through the same server-side verification contract with purpose REUSE, then enters TownTrack. It does not use the package's undocumented session-token exchange endpoint, accept a browser profile, or automatically redirect to the central dashboard.

This optional endpoint is **not confirmed supported by the linked public guide or the deployed provider**. The real provider returned404 on 2026-11-03. Missing endpoints, HTML, redirects, CORS failures and missing codes therefore leave the user on TownTrack. The explicit central-login button remains available as a fallback; that uses the documented login redirect flow. Logout pauses automatic reuse in the current tab, and concurrent logout cannot be undone by a delayed callback. One-use exchanges are never automatically retried.

The automatic branch is covered by simulated provider boundaries and real backend HTTP/DB integration tests. Those tests do not prove live silent SSO. Central cookies may also be limited by SameSite/third-party-cookie policies even if a credentialed endpoint is implemented.

## Provider information still needed for live acceptance

- Confirm TownTrack's exact registered service code and the user's service access; the current public code is `town-track`.
- Confirm the registered callback `https://towntrack.201.79.98.199.sslip.io/auth/callback` is honored after central authentication, rather than sending this E-Service request to `/dashboard`.
- Either make the documented login flow reuse the current central login and return a code, or supply a supported session-to-E-Service-code endpoint, response contract and credentialed CORS policy for TownTrack's origin.
- Complete one real login and prove verified user data reaches TownTrack, then verify the same IAM identity reuses its existing local account.

No local change can read another origin's HttpOnly cookie or turn an API key into a user's authenticated session. Keep keys in the server environment and out of Git/frontend storage. Do not enable mandatory central authentication until live acceptance succeeds and an administrator account is safely linked.
