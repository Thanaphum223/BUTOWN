# Gov account API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a Gov account from TownTrack and establish its verified local citizen session, with Gov email sign-in for recovery.
**Architecture:** A bounded server client talks to fixed official Gov endpoints. The controller shares the existing one-time session transaction and finalization with LINE SSO. A focused React form handles signup and email login while retaining legacy staff login.
**Tech Stack:** Spring Boot 3.5 / Java 21 / React 19 / Ant Design / Playwright.
**Spec:** docs/superpowers/specs/2026-11-04-gov-account-api.md

## Global Constraints
- Never create a production account during testing.
- Use only existing E_SERVICE_API_KEY, E_SERVICE_CODE, GOV_CALLBACK_URL.
- Never store/log/return passwords or central tokens.
- Trust identity only from verify-code; never auto-link by email or elevate roles.
- Fixed HTTPS official API origin; redirects disabled; short timeout, bounded responses, no retries.

## Review Focus
- A register timeout may have created the account: no automatic retry, direct user to email login.
- Gov returns a token rather than code: exchange only at the fixed service-scoped generate-code route.
- Logout or a newer transaction during network I/O must prevent local session resurrection.
- Wrong-purpose or replayed transactions must fail before any account creation request.
- Duplicate form submissions must send one request and clear credentials after completion.

### Task 1: Provider transport
**Files:** Create GovAccountClient.java and GovAccountClientTest.java under backend src main/test java th/go/towntrack.
**Interfaces:** consumes GovCenterSsoClient settings; produces register(name,email,password):void and loginCode(email,password):String.
- [ ] Write tests for official request contracts, code/token variants, fixed service, safe conflicts/timeouts, no redirects/oversized/malformed token/code, redacted DTO.
- [ ] Run targeted Maven test; expected missing feature failure.
- [ ] Implement bounded credential passthrough and safe error messages.
- [ ] Run targeted Maven test; expected PASS.
- [ ] Commit transport and tests.

### Task 2: Session-safe account endpoints
**Files:** Modify CentralGovAuthController.java and SecurityConfig.java; create GovAccountController.java and GovAccountControllerTest.java; extend GovCenterSsoIntegrationTest.java.
**Interfaces:** consumes Task 1; produces POST /api/auth/gov/register and /api/auth/gov/password-login; existing /gov/start supports REGISTER/PASSWORD_LOGIN. Shared consume/complete enforces purpose/session identity.
- [ ] Write controller tests for no transaction, CSRF/validation, wrong purpose, replay, register→login→verify→sync, credential isolation, partial failures, logout/new-start races; run RED.
- [ ] Extract shared consume/complete from callback and add validated endpoints/rate limits.
- [ ] Run unit tests GREEN and existing SSO integration in isolated CI.
- [ ] Commit endpoints and tests.

### Task 3: TownTrack forms and rollout
**Files:** Create frontend/src/GovAccountForm.tsx and frontend/tests/gov-account.spec.ts; modify App.tsx, GovLogin.tsx, govSso.ts, tests/gov-sso.spec.ts; update auth docs.
**Interfaces:** consumes Task 2 routes; mode register/login/null; onLogin reloads local session after CSRF refresh.
- [ ] Write mocked browser tests for signup/validation, email recovery, partial error, double submit, config errors and preserved LINE/staff login; run RED.
- [ ] Implement green forms; remove obsolete external signup helper/tests; clear passwords and use fresh random server-bound state on submit.
- [ ] Run browser tests GREEN, formatting/build, full CI and fresh whole-branch security review; fix important findings with RED→GREEN.
- [ ] Create/attach PR, merge under existing authorization, verify main CI/deploy and data counts. Live UI check without submission. Archive own worktree after rollout.
