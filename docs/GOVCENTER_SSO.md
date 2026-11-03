# Gov Center SSO configuration

Source contract: https://library.govcenter.co/sso and gov-sso-login 1.4.0.
TownTrack keeps React/Vite and Spring Boot; NestJS in the sample is not required.
The library generates the login URL/state. TownTrack registers that state server-side,
exchanges the code with CSRF protection, and creates its existing HttpOnly session.

## Configuration: one API key

On the test Droplet, edit `/opt/towntrack/.env` (mode 0600). For local compose use
an untracked `.env` in the repository. Never paste secrets into chat, commit `.env`,
or expose the API key in VITE_*/NEXT_PUBLIC_* variables.

```dotenv
E_SERVICE_CODE=your-registered-service-code
E_SERVICE_API_KEY=your-one-secret-api-key
GOV_CALLBACK_URL=https://your-towntrack-host/auth/callback
```

`E_SERVICE_API_KEY` is the only secret key required. `E_SERVICE_CODE` is a public
service identifier, NOT a second key. Obtain the code associated with that key
from the provider; do not derive/guess it. Client ID/Client Secret/introspection
settings from the previous integration are no longer used. These are the only three
Gov environment settings. Official auth/API endpoints are fixed to the guide's
`https://auth.govcenter.co` and `https://api-auth.govcenter.co`.

TownTrack resolves its own municipality from its database when starting LOGIN.
There must be exactly one local municipality; zero/multiple municipalities fail
clearly instead of choosing one silently. Explicit LINK uses the authenticated
local account's municipality, even when there are multiple local municipalities.
The chosen municipality is bound to the pending request, never taken from a
browser claim or the central user's municipality identifier.

Website URL is the TownTrack origin. Configure TownTrack's callback with `/auth/callback`;
if the provider has a separate redirect allowlist, confirm this exact URL is permitted.
The test site's callback is `https://towntrack.201.79.98.199.sslip.io/auth/callback`.
HTTPS is required except localhost/127.0.0.1 development URLs. A key alone does
not complete service registration or confirm that the callback is permitted.

## Safe rollout

1. Configure only the key, registered service code and approved callback URL.
2. Recreate the backend to load the environment; do not print the environment:
   `docker compose --env-file .env --env-file release.env up -d --force-recreate backend`.
3. Sign into the existing account with its normal password. Open **ข้อมูล Gov Center**
   (the account icon in the header), then **เชื่อมบัญชี Gov Center**.
   Verify with Gov Center. This binds the authenticated local account to the returned
   stable IAM user ID. Role, password, enabled flag and department are preserved.
4. Test a fresh SSO login and existing administrator access. Local credentials remain
   available; local roles and permissions apply equally to local and Gov sessions.
5. Provision other staff roles through TownTrack administration, as before.

A first SSO login without a prior identity link creates a new CITIZEN account.
TownTrack NEVER auto-links by email/display name or copies the IAM system ADMIN
role into local administration. Link the old account first to avoid a separate
new citizen account. Already-linked identities/accounts cannot be bound to a
different account. Disabled accounts cannot sign in through SSO.

## Protocol and residence data

- Frontend login URL: `https://auth.govcenter.co/auth/login?service=...&callback=...&state=...`.
- CSRF-protected `POST /api/auth/gov/start` binds the cryptographic state and optional
  authenticated LINK target to the session for ten minutes.
- Callback receives `code`/`state`; frontend clears them from the address bar and
  requires a matching state. Backend also requires and consumes the session state.
- `POST /api/auth/sso-callback` sends trimmed `{code}` to the provider's
  `/e-services/sso/verify-code` with `x-api-key` server-side only. No automatic retries:
  if a one-use code may have been consumed, start a fresh login.
- Session ID rotates; old admin role-switch attributes and CSRF token are cleared.
  Cookies remain HttpOnly/Secure in deployment and use SameSite=Lax for the callback.
- The public config exposes no secret. Callback returns only local account basics.
- `GET /api/auth/gov-profile` returns the authenticated account's synchronized IAM
  name/email/last-login time and residence membership statuses. It accepts no target
  user ID. The header account drawer reads it; missing homes can mean no linked
  residence or no scope, and are not treated as a failed login. Existing local names
  and roles are preserved; the latest provider name is displayed separately.
- Password, Gov SSO and LINE sign-ins enforce five concurrent sessions. Changing
  an account's role/department or enabled status expires its registered sessions.
- Minimal IAM profiles and returned residence snapshots/membership statuses are
  synchronized transactionally. Empty residences is supported and removes stale
  membership links. No residence search, claims or extra IAM scopes are requested.
- Both member_status AND residence_status must equal VERIFIED before a future
  residence-dependent official transaction. Pending/UNKNOWN is not verification.

Missing/invalid key, invalid/used code, missing/expired/mismatched state, malformed
responses and provider outages fail closed. These cases are tested with an isolated
local IAM HTTP stand-in; live provider acceptance still needs real registration.

## Live troubleshooting

A public `configured: true` only confirms local settings; it does not prove provider
acceptance. Start from the TownTrack SSO button for a fresh session-bound state. A
successful live test must return to `/auth/callback`, verify a real one-time code,
create the local session, and show the synchronized account information.

If the provider instead opens its own `/dashboard` without returning a code, check
the exact registered service code and that the IAM account can access that E-Service.
Only seeing WATER in IAM's E-Services list does not establish TownTrack access.
The provider must also preserve `service`, `callback` and `state` during login.
Do not replace the callback with the Website URL or guess undocumented login routes.

Calling verify-code with an invented code is not a credential test. A plain-text
403 (including `error code: 1010`) does not establish that an API key is wrong or
that the API application processed the request. TownTrack reports such rejections
as a provider/configuration problem, and does not retry one-time codes or reveal
the provider's raw response, key or code to the browser.
