# SSO profile and security audit

> Execute inline using executing-plans. User has authorized implementation details and deployment.

Goal: finish the TownTrack side of documented SSO, make synchronized user information usable, and repair concrete audit findings without inventing a provider protocol.

Architecture: retain gov-sso-login's documented login URL and one-time exchange, HttpOnly local sessions, explicit account linking and local roles. Provider registration/access is external and must be verified live.

## Constraints
- Never log or commit API keys or codes. Never auto-link by email/name or elevate from IAM roles.
- Preserve local display names for explicitly linked existing accounts; expose latest IAM name separately.
- Profile endpoint returns only the authenticated user's synchronized profile and residences.
- Keep local login available; no activation of central enforcement.

## Tasks
- [x] Baseline backend suite in isolated PostGIS; frontend install/audit/build.
- [x] RED: profile read ownership and updated IAM data, role-change session invalidation, six SSO logins, provider error classification.
- [x] GREEN: own-profile endpoint/UI, revoke sessions after role changes/disable, shared concurrency strategy for Gov and LINE, safe provider error messages.
- [x] Full backend and browser suite run, fresh review findings addressed, production build. Backend77 passed; CI browser15 passed. Nine legacy browser tests remain red and reproduced against baseline f8f09b6 (not hidden or marked skipped).
- [ ] Push/deploy with existing authorization; verify health/config and try real SSO, report provider-side blocking evidence honestly.

## Review focus
- Local account role changes must invalidate previous session privileges.
- SSO/LINE must use the same five-session ceiling as password login.
- Empty/unlinked profiles and private address data must not leak to other users.
- Transport rejection must not be reported as an expired user code.
- Mock provider tests cannot establish live provider registration or callback behavior.

## Evidence and rulings
- Baseline71 backend passed after cleaning stale generated class artifacts (initial IO error was not a source failure).
- RED: four new backend assertions failed (404 own profile, no session revocation, no session ceiling, wrong 401 transport rejection); profile drawer test failed on missing control.
- GREEN: full backend77; CI browser15, including 390px profile drawer; production build passed; npm audit0; peer review found no remaining important changes in this diff.
- Full browser27 initial run:17 passed/10 failed; first officer failure was service startup timing. The other9 reproduced on unchanged f8f09b6 frontend: obsolete citizen dashboard/wizard/GPS assumptions. Ruling: preserve current user flows, document legacy test drift rather than changing product behavior or silently skipping tests. CI15 rerun on prepared isolated DB passed.
- Ruling: preserve local account display names; latest IAM name/email is available through own-profile endpoint. Existing local roles/passwords are never overwritten by IAM.
- Ruling: retain documented login URL and stop at external registration/access boundary; do not guess endpoints, bypass provider access controls, or treat invalid-code tests as key validation.
