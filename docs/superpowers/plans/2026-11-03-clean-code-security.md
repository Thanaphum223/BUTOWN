# Clean Code and Security Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for product changes; independent reviewers audit auth and media boundaries. Browser test maintenance is delegated independently with no product edits.

**Goal:** Make the existing TownTrack source consistently readable, fix demonstrated security/data-integrity defects, and restore meaningful full regression verification without changing existing accounts or removing features.

**Architecture:** Keep React/TypeScript, Spring Boot/Java21 and PostgreSQL/PostGIS. Keep local authorization and verified external identities separate. Split only focused security helpers, use automated formatting rather than a rewrite, and preserve current DB schema.

**User scope:** Whole-code cleanup/security; prior user instruction delegates implementation details and opts out of repeated design questions. No credential changes or destructive data operations. Cloud settings/secrets remain separate from Git. No claim of absolute security or successful live Gov SSO without provider evidence.

## Review focus
- A partial PRE_ASSIGN approval must never release work before all approvers finish.
- Admin role switching must not change the original account's department/password/role.
- No geolocation before privacy acknowledgement; StrictMode must not duplicate automatic GPS requests.
- An explicit address-only complaint may omit both coordinates, but not one or an invalid number.
- Proxy rate limits must distinguish real clients and ignore forged public forwarding headers.

## Tasks
- [x] Add failing backend regressions for two-stage PRE_ASSIGN approval, temporary admin department scope and address-only submissions; verify RED before minimal fixes.
- [x] Preserve the browser GPS regression; fix automatic location requests once per active user/privacy boundary and preserve explicit location retries.
- [x] Add a reproducible proxy topology test; resolve only the configured internal gateway IP as trusted and verify rate isolation + header spoof resistance. Permit the intended Gov connection in CSP.
- [x] Add pinned Java/Frontend format tooling, format tracked source and tests, exclude generated files and existing sync duplicates. Add checks to CI.
- [x] Update obsolete browser assertions to current real forms, evidence uploads, location confirmation and role-specific pages; retain workflow/denial/privacy coverage and run the whole suite in an isolated DB.
- [x] Backend verify, frontend build, npm audit, proxy integration tests, full browser suite, independent review; publish concrete changes/results/remaining limits.

## Verification commands
- Backend: Docker Maven3.9/Java21 `mvn clean verify` against disposable PostGIS17.
- Formatting: `mvn spotless:check`; frontend `npm run format:check`.
- Browser: `TT_BOOTSTRAP_PASSWORD=... TT_DEMO_PASSWORD=... npm test` against disposable backend and Vite.
- Frontend runtime image: `docker build -f deploy/Dockerfile.frontend ...` from a clean tracked-source snapshot.
- Proxy: `python3 scripts/test-proxy-security.py --image towntrack-cleanup-frontend-test` (creates/removes only own containers/network).

## Verified results
- Three new backend regressions were observed RED (approval bypass, persisted admin department, rejected address-only submission) before minimal fixes.
- Backend84/84 passed0skipped in clean isolated source/database.
- Browser32/32 passed0flaky0skipped; inspected generated Playwright report stats and last-run, not only agent summary.
- Production frontend image built; frontendformatcheck and MavenSpotlesscheck passed.
- npm audit0reportedvulnerabilities; tracked-source hygiene passed.
- Proxy test observed old shared bucket failure, then verified distinct clients plus forged header resistance and Gov CSP allowance.
- Independent final review found no important issue. Existing local IDE/sync duplicates were left outside changes; generated polluted backend/target reports are not verification evidence.
- Source changes are ready for review; not deployed. Real Gov provider acceptance remains separate/unverified. Cloud Compose/Caddy changes must be installed alongside image rollout.
