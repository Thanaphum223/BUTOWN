# Gov-only Authentication Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship compact Gov-only login and signup while preserving verified Gov flows and existing data.
**Architecture:** Reuse GovAccountForm and GovLogin with a simple auth shell. Disable legacy routes in SecurityConfig. Keep business-flow fixture authentication exclusively in test sources.
**Tech Stack:** React, TypeScript, Ant Design, Spring Security, JUnit, Playwright.
**Spec:** docs/superpowers/specs/2026-11-04-gov-auth-card.md

## Global Constraints
- No real registrations during verification, no password/token logging or persistence.
- No account/data deletion, no email auto-link, no new production environment flags/dependencies.
- Preserve CSRF, one-use purpose-bound state, request locking and password clearing.
- Green theme; centered 400px card; no legacy login UI or production credential route.

## Review Focus
- Mode switching during submission must not alter the request purpose or disclose retained passwords.
- Gov config failure must show a useful unavailable state with no fallback to legacy authentication.
- Existing linked staff identities retain roles; no auto-migration from an unverified email.
- Test-only login/seed facilities must never be present in the production jar.
- Narrow/short mobile screens, keyboard navigation and zoom must keep all four signup fields reachable.

### Task 1: Gov-only entry points
**Files:** SecurityConfig.java; backend/src/test/java/th/go/towntrack/GovOnlyAuthenticationTest.java; BrowserTestServer.java; TownTrackIntegrationTest.java; frontend/tests/product-flow.ts; cloud-smoke.spec.ts; location-popup.spec.ts; .github/workflows/verify.yml.
**Interfaces:** existing Gov controllers/session creation unchanged; test launcher exports only test /api/test/session and /api/test/accounts routes outside production artifact.
- [ ] Write a no-database security test: legacy login/registration/direct LINE fail for anonymous and authenticated callers; no Db access or saved principal; missing CSRF still fails.
- [ ] Run the test; expected RED because current local credentials can authenticate or registration reaches controller.
- [ ] Disable production form login and deny legacy routes. Preserve UserDetailsService for verified Gov session creation. Add test-source-only browser launcher, update fixture callers, and change integration assertions for closed registration and manually established session-expiration scenario.
- [ ] Run targeted JUnit security tests; expected PASS. Verify test launcher excluded from packaged jar in CI.
- [ ] Commit task changes.

### Task 2: Compact login and signup
**Files:** frontend/src/App.tsx, GovAccountForm.tsx, GovLogin.tsx, style.css; frontend/tests/gov-account.spec.ts, gov-sso.spec.ts.
**Interfaces:** GovAccountMode becomes login/register with login default; API payloads and purpose values remain unchanged. GovLogin keeps authenticated linking behavior.
- [ ] Update browser assertions for default email login, absent username/legacy controls, signup four fields, cleared values after mode switch, and mutual request locking. Run focused tests; expected RED on new behavior.
- [ ] Remove local login/LIFF/hero from anonymous shell, use shared centered card, add LINE label/icon and divider, keep green theme, make signup/login mode links accessible.
- [ ] Run frontend format/build, focused auth tests; expected PASS. Inspect desktop/mobile screenshots with blank credentials against references. Config-failure and narrow viewport assertions included in auth tests.
- [ ] Commit task changes.

### Task 3: Review and deployment
- [ ] Run source hygiene, full applicable frontend suite and backend tests in CI. Inspect production-jar exclusion.
- [ ] Fresh whole-branch review, fix important findings with targeted RED/GREEN tests.
- [ ] Create/attach PR, merge and wait for successful main CI and CD.
- [ ] Read-only live release/data audit, confirm closed legacy endpoints and delivered auth assets. Preserve already signed-in user tab; use local mock preview for screenshots.
- [ ] Report deployed outcome and any material limitations.
