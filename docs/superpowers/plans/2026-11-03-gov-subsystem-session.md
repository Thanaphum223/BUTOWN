# Gov subsystem session reuse

User intent: TownTrack is an E-Service under Gov. Reuse central login to receive verified user data and enter TownTrack, not an extra profile-view step or a forced central dashboard navigation. User delegates design/execution details.

## Contract and design
- First reuse a valid TownTrack session. If none, attempt a single credentialed central session check while staying on TownTrack.
- gov-sso-login1.4.0 exposes a session-check helper at /auth/session. Live auth.govcenter.co currently returns404 there. The linked guide documents verify-code for one-time codes, but no endpoint for verifying arbitrary session tokens. This is a confirmed deployment/contract gap, not permission to trust browser profile data.
- Only a `code` from the central session response may enter the existing session-bound, CSRF-protected verify-code flow. Ignore user claims and opaque sessionToken/token aliases without a documented verifier. Retain manual documented login initiation as an explicit fallback; never auto-navigate to central dashboard when the check is absent, blocked or unavailable.
- LINK remains explicit. Existing local authorization and stable IAM identity binding remain authoritative.
- Pause automatic reuse after local logout within this tab, until an explicit sign-in attempt. No token in storage.

## Tasks
- [x] RED browser tests: automatic central code exchange without navigation, no trust of profile-only/sessionToken response, unavailable/absent session remains local, no central probe with local session, logout does not immediately relogin; explicit LINK.
- [x] Implement bounded session probe and reuse in GovLogin, single StrictMode attempt and logout pause.
- [ ] Backend suite + full browser suite, correct obsolete browser assumptions without weakening product checks, production build and independent review.
- [ ] Deploy and verify live. If central still404, report exact blocking contract; never claim silent SSO succeeded from mocked tests.

## Review focus
- Single-use codes must never be retried automatically, nor replayed via StrictMode.
- Central profile claims alone must never authenticate or elevate a user.
- Logout must not be undone by automatic reuse.
- Failed/redirected/HTML/CORS-blocked central checks must not strand the login page or navigate to dashboard.
- Existing local login and explicitly authorized links must remain usable.

Verification: backend81/81 passed; SSO browser11/11 passed; clean Docker frontend build using Node24 passed (npm audit0 vulnerabilities). Independent security review cleared logout-finalization race after adding shared logout mutex and regression test. Full UI suite is recorded separately, including existing obsolete expectations.

Final full-browser run:23 passed,9 failed (same nine pre-existing expectations reproduced before this change). These remain unresolved; do not label the whole suite green. No live silent-login acceptance and no deployment of this branch. Preserve as draft pending provider contract and remaining UI test maintenance.
