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
GOV_AUTH_MODE=local
IAM_API_URL=https://api-auth.govcenter.co
IAM_GOV_FRONTEND_URL=https://auth.govcenter.co
E_SERVICE_CODE=your-registered-service-code
E_SERVICE_API_KEY=your-one-secret-api-key
GOV_CALLBACK_URL=https://your-towntrack-host/auth/callback
GOV_MUNICIPALITY_ID=your-local-municipality-uuid
```

`E_SERVICE_API_KEY` is the only secret key required. `E_SERVICE_CODE` is a public
service identifier, NOT a second key. Obtain the code associated with that key
from the provider; do not derive/guess it. Client ID/Client Secret/introspection
settings from the previous integration are no longer used. The local municipality
UUID comes from TownTrack, not an arbitrary browser input or IAM system role.

Register the exact HTTPS callback URL with Gov Center, including `/auth/callback`.
The test site's callback is `https://towntrack.201.79.98.199.sslip.io/auth/callback`.
HTTPS is required except localhost/127.0.0.1 development URLs. A key alone does
not complete service registration or confirm that the callback is permitted.

## Safe rollout

1. Configure the key, code, callback and municipality while `GOV_AUTH_MODE=local`.
2. Recreate the backend to load the environment; do not print the environment:
   `docker compose --env-file .env --env-file release.env up -d --force-recreate backend`.
3. Sign into the existing account with its normal password. Use **เชื่อมบัญชี Gov Center**.
   Verify with Gov Center. This binds the authenticated local account to the returned
   stable IAM user ID. Role, password, enabled flag and department are preserved.
4. Test a fresh SSO login and existing administrator access before considering
   `GOV_AUTH_MODE=central`. Central enforcement rejects unverified staff sessions;
   enabling it before linking the administrator can lock out that administrator.
5. Provision other staff roles through TownTrack administration, as before.

A first SSO login without a prior identity link creates a new CITIZEN account.
TownTrack NEVER auto-links by email/display name or copies the IAM system ADMIN
role into local administration. Link the old account first to avoid a separate
new citizen account. Already-linked identities/accounts cannot be bound to a
different account. Disabled accounts cannot sign in through SSO.

## Protocol and residence data

- Frontend login URL: `{IAM_GOV_FRONTEND_URL}/auth/login?service=...&callback=...&state=...`.
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
- Minimal IAM profiles and returned residence snapshots/membership statuses are
  synchronized transactionally. Empty residences is supported and removes stale
  membership links. No residence search, claims or extra IAM scopes are requested.
- Both member_status AND residence_status must equal VERIFIED before a future
  residence-dependent official transaction. Pending/UNKNOWN is not verification.

Missing/invalid key, invalid/used code, missing/expired/mismatched state, malformed
responses and provider outages fail closed. These cases are tested with an isolated
local IAM HTTP stand-in; live provider acceptance still needs real registration.
