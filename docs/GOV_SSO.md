# Gov Center as TownTrack's identity provider

Reference: https://library.govcenter.co/sso (checked 2026-11-03).

TownTrack is an E-Service. Gov authenticates the person; TownTrack retains its own authorization, complaints and HttpOnly session. A profile viewer is not the authentication mechanism.

## Verified code contract

Gov issues a single-use code and returns it to the registered TownTrack `/auth/callback`, with the initiating state. The browser sends this code and state to TownTrack. The backend consumes the server-bound state once and calls `POST https://api-auth.govcenter.co/e-services/sso/verify-code` with `{code}` and the server-only `x-api-key`. The live endpoint returns HTTP 201 on successful verification, while the published OpenAPI lists HTTP 200. TownTrack accepts these two success statuses and validates the same required user schema for both; other statuses never authenticate. Only the verified response supplies the IAM identity and residence data. The browser must never supply a trusted identity, role, API key or central access token.

New identities use the configured mapping of a verified TownTrack E-Service role; no matching service role defaults to CITIZEN. Global system roles and municipality membership roles do not grant TownTrack authority. Existing local accounts are linked only by an explicit authenticated LINK operation. Once created, local roles and department assignments remain authoritative; never merge accounts by matching a name/email.

## Login initiation and existing central login

TownTrack first checks its own `/api/auth/me` session. If absent, it shows the sign-in screen. One click on the Gov Center button uses `GovSsoClient.getLoginUrl()` to generate/store a nonce, records it with TownTrack's CSRF-protected `/api/auth/gov/start`, then opens Gov's published LINE authorization flow. Its fixed LINE channel is `2008946775`, its LINE redirect is `https://api-auth.govcenter.co/auth/line/callback`, and its scopes are `profile openid email`. LINE state contains the configured TownTrack callback with a transaction `state` query plus the configured service code. Neither destination nor service is taken from incoming browser parameters. LINK uses the same flow from an authenticated local account. Failed start stays on TownTrack and restores the local form.

The guide documents the one-time-code redirect/verify flow, not a browser `/auth/session` endpoint. TownTrack therefore does not call that endpoint, use an opaque session token, or inspect another origin's cookies. Gov Center controls reuse of its existing login when this documented authorization flow starts. A provider session should return an E-Service code to `/auth/callback`; landing on Gov's own dashboard without a callback is not a successful TownTrack login.

## Citizen registration

The login screen opens a TownTrack form for Gov registration (name, email, password and local-only confirmation). Submit creates a CSRF-protected, ten-minute, single-use REGISTER transaction. The backend calls Gov `POST /auth/register` with name/email/password, then `POST /auth/login?service=<E_SERVICE_CODE>` with email/password. It uses the returned service code, or an in-memory access token to call `POST /e-services/sso/generate-code` with `{eServiceCode}`. Only `verify-code` supplies trusted identity; registration/login response identities are ignored. The verified identity establishes TownTrack's own citizen session and opens home.

The separate Gov email sign-in form follows PASSWORD_LOGIN → login → code → verify without registering again. This supports existing Gov email accounts and recovery when registration succeeded but a later step failed. Registration conflict points to email login. A network timeout has an unknown registration outcome: no automatic retry is made, and the user is directed to email login first. Once Gov confirms creation, later errors explicitly distinguish successful registration from failed local sign-in.

Credentials travel only over the authenticated HTTPS provider connection and remain in request memory; they are never stored, logged or returned. Central access/refresh tokens never reach the browser, local session or database. Response bodies are bounded, redirects disabled, and no provider write/code exchange is automatically retried. Request DTOs redact credentials in string/JSON output, form passwords clear after submission or leaving the form. Existing Gov email login and LINE SSO remain available. The only three Gov environment values are unchanged. Mock provider tests cover signup; no real Gov account is created during testing. Production signup compatibility is not established merely by a mock passing.

Gov's public registration web page drops the external sslip.io destination during its own navigation. The approved API form replaces that obsolete external handoff without bypassing the provider's redirect checks or reading its browser session.

A completed, verified Gov code may carry `is_new_user=true` or `false`. The marker is ignored for identity/permissions and does not block an otherwise valid exchange. Explicit onboarding status, invalid markers, missing/mismatched state and rejected codes remain failures. The backend creates a new IAM-linked account with its mapped initial role only from the verified response, rotates the session and returns TownTrack `/` without requiring a second local login. No real Gov account was created to test registration.

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

## Initial roles and fresh rejoin (2026-11-05)

Administrators configure **จัดการระบบ → บทบาท Gov Center**. GET/POST `/api/admin/gov-roles` contains `{municipalityId,serviceId,mappings:[{govRole,role,departmentId}]}`. The municipality ID is the central Gov identifier, not TownTrack's local UUID. Staff imports require that exact active membership and the configured TownTrack service code; an optional service ID supports payloads identifying the service only by ID. Supported service access representations are `eService.code` / `service.code` / `serviceCode`, optional corresponding `id` / `eServiceId` / `serviceId`, and `role.code` / `roleCode` / string `role`. Contradictory identifiers/roles fail instead of selecting higher authority.

Defaults map the six TownTrack codes to themselves and USER/MEMBER to CITIZEN. Additional codes are editable, normalized case-insensitively, limited to100 mappings. LEADER/FIELD require a selected local department before first sign-in. OFFICER/APPROVER have no department. Explicit unknown staff roles, missing municipality scope, conflicting roles or missing required department return an actionable503 and create no account. Inactive, explicitly foreign municipality and unrelated service roles confer no authority. A later local role edit is retained on subsequent sign-ins. Mapping changes affect only new accounts.

Deletion archives the old account, revokes its sessions and preserves work/evidence/audit references. A later verified sign-in of that same Gov identity creates a new local UUID and credentials, replaces the profile binding, and uses the current Gov initial-role mapping. It does not restore old personal complaint ownership, votes, follows, notifications, assignments or local role overrides. Ordinary permissions of a newly mapped staff role still apply to shared municipal work. Suspension without deletion stays blocked. New profile/residence data comes from the latest verified Gov response.

The published primary reference is https://api-auth.govcenter.co/api-json. It documents E-Service role codes and serviceAccess but its SSO example has an empty serviceAccess array. Synthetic tests verify supported representations; no live staff payload compatibility or production Gov registration is claimed from those tests. Configure central IDs/codes from the Gov administrator before staff onboarding; do not infer them from names or the first sign-in.
