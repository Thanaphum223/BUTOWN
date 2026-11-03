# Gov Center login contract

Reference: https://library.govcenter.co/sso, checked 2026-11-03. This describes the documented one-time-code flow implemented by TownTrack. It does not claim that the live provider has completed a successful callback.

## Configuration

Set only `E_SERVICE_API_KEY`, `E_SERVICE_CODE` and `GOV_CALLBACK_URL`. The official Gov auth/API URLs are constants. Anonymous LOGIN uses the single local municipality from TownTrack's database; if zero/multiple municipalities exist, it rejects the request without guessing. Explicit LINK uses the authenticated local account's municipality. The selected municipality is bound to pending state and rechecked when linking. The public `mode: local` field is compatibility metadata, not an environment switch.

## Request and response boundaries

| Sender → receiver | Method / destination | Values | Purpose |
| --- | --- | --- | --- |
| TownTrack browser → TownTrack backend | `GET /api/public/gov-auth` | Response: `iamAuthUrl`, `serviceCode`, `callbackUrl`, `mode`, `configured` | Obtain public runtime settings. `configured` describes local configuration, not provider acceptance. |
| TownTrack browser → TownTrack backend | `POST /api/auth/gov/start` | `{state, purpose}`; own CSRF header and cookie | Register a ten-minute, single-use pending login. `purpose` is `LOGIN` or authenticated `LINK`. |
| TownTrack browser → Gov browser frontend | `GET https://auth.govcenter.co/auth/login` | Query: `service=town-track`, exact `callback`, random `state` | Start the same browser redirect that `gov-sso-login` uses. |
| LINE → Gov | Gov's LINE OAuth callback | LINE authorization code / Gov's OAuth state | Gov authenticates its user. These are not TownTrack's credentials or SSO code. |
| Gov → TownTrack browser | `GET https://towntrack.201.79.98.199.sslip.io/auth/callback` | Query: fresh Gov `code`, original TownTrack `state` | Return to the registered E-Service receiver. Gov may also append `service` and `is_new_user`; neither grants local permissions. |
| TownTrack browser → TownTrack backend | `POST /api/auth/sso-callback` | JSON `{code, state}`; own CSRF header and cookie | Match the initiating browser/server state, consume it once and request verification. |
| TownTrack backend → Gov API | `POST https://api-auth.govcenter.co/e-services/sso/verify-code` | Header `x-api-key`; JSON `{code}` | Verify the trimmed, one-use Gov code. The API key never reaches the browser. |
| Gov API → TownTrack backend | JSON response to `verify-code` | `user`, optional `residences` | Supply authenticated identity and available residence data. |
| TownTrack backend → TownTrack browser | Response to local callback | `{success: true, user: <local account>}`; own Session cookie | Authenticate using local permissions, rotate Session ID, refresh CSRF, reload TownTrack `/`. |

The approved callback URI remains exactly `https://towntrack.201.79.98.199.sslip.io/auth/callback`. The initiating `state` is a separate outer login parameter. It is not appended inside the registered callback URL. The query on the returned URL is removed immediately after reading it, and callback access logging is disabled.

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
- `frontend/src/GovLogin.tsx`: pending login and exact registered redirect.
- `frontend/src/GovCallback.tsx`: returned query, state verification, local callback and reload.
- `backend/src/main/java/th/go/towntrack/CentralGovAuthController.java`: pending server state, callback and local authenticated Session.
- `backend/src/main/java/th/go/towntrack/GovCenterSsoClient.java`: server-only `verify-code` request and bounded response validation.
- `backend/src/main/java/th/go/towntrack/GovIdentityService.java`: identity linking, minimum profile and residence snapshots.

## Live acceptance

Test the actual deployed release separately from mocked provider tests. Success requires a real Gov code returning with the original state, successful server verification, a local authenticated Session and entry into TownTrack. Landing on Gov's dashboard is not success.

The public provider code inspected on 2026-11-03 rejects the current `sslip.io` callback hostname and does not explicitly forward the original state through the inspected LINE flow. These upstream conditions are recorded in `GOV_SSO.md`. Do not bypass URL validation or remove state validation to disguise them.
