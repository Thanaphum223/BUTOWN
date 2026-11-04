# Gov Center login contract

Reference: https://library.govcenter.co/sso, checked 2026-11-04. Existing LINE sign-in has been verified live. Registration return is a separate provider boundary and has not completed a live new-account round trip.

## Configuration

Set only `E_SERVICE_API_KEY`, `E_SERVICE_CODE` and `GOV_CALLBACK_URL`. The official Gov auth/API URLs are constants. Anonymous LOGIN uses the single local municipality from TownTrack's database; if zero/multiple municipalities exist, it rejects the request without guessing. Explicit LINK uses the authenticated local account's municipality. The selected municipality is bound to pending state and rechecked when linking. The public `mode: local` field is compatibility metadata, not an environment switch.

## Request and response boundaries

| Sender → receiver | Method / destination | Values | Purpose |
| --- | --- | --- | --- |
| TownTrack browser → TownTrack backend | `GET /api/public/gov-auth` | Response: `iamAuthUrl`, `serviceCode`, `callbackUrl`, `mode`, `configured` | Obtain public runtime settings. `configured` describes local configuration, not provider acceptance. |
| TownTrack browser → TownTrack backend | `POST /api/auth/gov/start` | `{state, purpose}`; own CSRF header and cookie | Register a ten-minute, single-use pending login. `purpose` is `LOGIN` or authenticated `LINK`. |
| TownTrack browser → LINE | `GET https://access.line.me/oauth2/v2.1/authorize` | Fixed Gov channel/callback/scopes; LINE state carries configured service and TownTrack callback with nonce | Start the working Gov LINE flow (see `GOV_SSO.md`). |
| TownTrack browser → Gov signup | `GET https://auth.govcenter.co/auth/register` | Configured `service`, `callback` with nonce, outer `state` | Open central signup after recording a pending LOGIN. No TownTrack signup fields or passwords are submitted. |
| LINE → Gov | Gov's LINE OAuth callback | LINE authorization code / Gov's OAuth state | Gov authenticates its user. These are not TownTrack's credentials or SSO code. |
| Gov → TownTrack browser | `GET https://towntrack.201.79.98.199.sslip.io/auth/callback` | Query: fresh Gov `code`, original TownTrack `state` | Return to the registered E-Service receiver. Gov may also append `service` and `is_new_user`; neither grants local permissions. |
| TownTrack browser → TownTrack backend | `POST /api/auth/sso-callback` | JSON `{code, state}`; own CSRF header and cookie | Match the initiating browser/server state, consume it once and request verification. |
| TownTrack backend → Gov API | `POST https://api-auth.govcenter.co/e-services/sso/verify-code` | Header `x-api-key`; JSON `{code}` | Verify the trimmed, one-use Gov code. The API key never reaches the browser. |
| Gov API → TownTrack backend | JSON response to `verify-code` | `user`, optional `residences` | Supply authenticated identity and available residence data. |
| TownTrack backend → TownTrack browser | Response to local callback | `{success: true, user: <local account>}`; own Session cookie | Authenticate using local permissions, rotate Session ID, refresh CSRF, reload TownTrack `/`. |

The configured/registered callback remains `https://towntrack.201.79.98.199.sslip.io/auth/callback`. For each transaction the runtime destination carries a generated `state` query because Gov's helpers do not consistently preserve the outer nonce. Registration also includes outer `state`. Neither destination nor service is taken from incoming query parameters. Browser and backend still require the original nonce, and the backend consumes it once before verification. The returned URL query is removed immediately after reading it, and callback access logging is disabled.

`is_new_user=true` is metadata, not proof of authentication or incomplete onboarding. Boolean `true`/`false` may accompany a valid code, but cannot replace it. An explicit `auth_status`, malformed marker, provider error, duplicate field, missing/mismatched state or failed code exchange still prevents login.

## Registration provider limit

The public Gov RegisterForm inspected on 2026-11-04 calls its own registration server action and navigates to its Login page on success. Its auth-flow helper preserves safe callback/callbackUrl/redirect/service values, drops outer state, and rejects external callback hosts other than govcenter.co/gov.co (with localhost development exceptions). The current TownTrack sslip.io destination therefore does not survive that helper. Already signed-in Gov users visiting registration may instead reach Gov's dashboard. TownTrack cannot turn either response into a verified local session.

TownTrack supplies its configured return and accepts a verified code for a new identity, but automatic return after central registration requires Gov's signup/login path to preserve the registered destination and nonce and issue the E-Service code. This is not established by mocked tests or by opening the registration page. Do not bypass the provider's redirect checks or create an account simply to test this boundary.

## Verified data handling

| Gov response field | TownTrack use |
| --- | --- |
| `user.id` | Required, stable IAM identity scoped to the local municipality. Never use an unverified browser claim or match accounts by name/email. |
| `user.name`, `user.email` | Minimal synchronized IAM profile. Existing local credentials and permissions remain intact. |
| Other `user` properties / IAM system roles | Do not grant local privileges. A new IAM account starts as `CITIZEN`; explicit account linking preserves existing local roles. |
| `residences[].addressSnapshot.residenceId` | Stable residence snapshot identifier. |
| Approved address/location fields in `addressSnapshot` | Store a bounded snapshot for the user's own profile, not an authoritative local residence registry. |
| `membershipId`, `role`, `status`, `verifiedAt` | Store the user's residence membership relationship and verification state. This `role` describes residence membership, not TownTrack staff authorization. |
| `residences[].residence.status` | Keep separate from membership `status`. Official use requires both to be `VERIFIED`. Missing/unverified data does not establish ownership. |

Residences may be absent or empty. Do not assume a person has a residence. Residence search and claim APIs are separate optional functionality, not a prerequisite for login.

## Why the SDK callback transport is adapted

TownTrack calls the installed `GovSsoClient.getLoginUrl()` for the documented login URL and its state generation/storage. The application keeps its existing Spring backend and HttpOnly Session instead of replacing them with the guide's example NestJS/JWT backend.

The default SDK callback hook only checks state when one is supplied, does not send TownTrack's CSRF header/server-bound state, and automatically retries some failures. TownTrack's callback transport therefore validates state explicitly on both sides, sends the application's CSRF header and exchanges a single-use code only once. It does not accept an arbitrary central profile, opaque session token or LINE ID token as a Gov SSO code.

## Files responsible

- `frontend/src/govSso.ts`: public runtime configuration and official SDK client.
- `frontend/src/GovLogin.tsx`: shared pending login/link/registration start and navigation.
- `frontend/src/GovCallback.tsx`: returned query, state verification, local callback and reload.
- `backend/src/main/java/th/go/towntrack/CentralGovAuthController.java`: pending server state, callback and local authenticated Session.
- `backend/src/main/java/th/go/towntrack/GovCenterSsoClient.java`: server-only `verify-code` request and bounded response validation.
- `backend/src/main/java/th/go/towntrack/GovIdentityService.java`: identity linking, minimum profile and residence snapshots.

## Live acceptance

Test the actual deployed release separately from mocked provider tests. Success requires a real Gov code returning with the original state, successful server verification, a local authenticated Session and entry into TownTrack. Landing on Gov's dashboard is not success.

The working LINE flow preserves the nonce on the configured callback destination. Gov's browser registration helper remains a different path with the limitation above. Do not generalize a passing LINE login into a claim that signup automatically returns.
