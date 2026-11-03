# Gov LINE Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Authenticate through Gov's LINE integration and return to TownTrack with a verified service-scoped code, without visiting Gov's dashboard.

**Architecture:** Use Gov's published LINE authorization helper contract and its documented backend callback, returning to the configured TownTrack callback with a transaction nonce in its query. Only redeem Gov's E-Service code through the existing server-side API-key verifier. Capture an allowlist and scrub callback credentials before loading React/config; retain server pending-state, CSRF, session-race and local-role protections.

**Tech Stack:** React, TypeScript, gov-sso-login 1.4.0, Playwright, Spring Boot, nginx.

**Spec:** User request to fix only TownTrack and complete real sign-in; official https://library.govcenter.co/sso and https://api-auth.govcenter.co/api-json. The public API documents LINE callback returning a one-time ticket and SSO code when applicable. The service's registered callback is https://towntrack.201.79.98.199.sslip.io/auth/callback. Public Gov frontend restricts downstream callbacks to its own domains, so direct supported LINE initiation is tested as an alternative.

## Global Constraints

- Central integration ENV remains E_SERVICE_API_KEY, E_SERVICE_CODE, GOV_CALLBACK_URL only. API key stays server-side.
- Fixed Gov LINE channel 2008946775; LINE redirect https://api-auth.govcenter.co/auth/line/callback; scope profile openid email.
- Destination comes only from validated local configuration; no browser-controlled service/callback override.
- Never exchange, forward, log or persist Gov tickets or parent IAM tokens. Only verified scoped code authenticates locally.
- One-use expiring nonce must return unchanged and match browser and server state. No fallback to local state when missing.
- Preserve existing local password login, explicit linking, local authorization and disabled-account restrictions.
- Fail closed on provider errors, onboarding/new-user status, malformed/duplicate query fields or wrong service.

## Review Focus

- Provider error/new-user/onboarding returns must not create a local session.
- Missing nonce/code, mismatched nonce/service, and duplicate nonce/code/service must not reach verification. Service is optional metadata; when present it must match. Service ownership is authoritatively enforced by the API-key verifier.
- Callback credential query/fragment must disappear before any config/auth requests; no ticket/token retained in storage or forwarded.
- Exact registered callback with transaction query must work in real Gov authentication; simulated tests alone do not establish compatibility.
- Callback pages must be no-store/no-referrer and omit credentials from proxy logs.

### Task 1: Supported Gov LINE initiation and safe callback processing

**Files:**
- Modify: frontend/src/govSso.ts, frontend/src/GovLogin.tsx, frontend/src/GovCallback.tsx, frontend/src/App.tsx, frontend/src/main.tsx
- Create: frontend/src/govCallbackReturn.ts
- Modify: frontend/tests/gov-sso.spec.ts, deploy/nginx.conf, scripts/test-proxy-security.py, README.md

**Interfaces:**
- Consumes: GovConfig; GovSsoClient.getLoginUrl()/verifyState(); existing POST /api/auth/gov/start and /api/auth/sso-callback.
- Produces: safe LINE URL with nested service/callback/state; sanitized in-memory callback result passed to GovCallback.

- [ ] **Step 1: Write failing browser regressions.** Assert LINE URL fixed channel/backend redirect, own configured callback with nonce, nested service, and matching start nonce. Assert callback scrubs before delayed config fetch; rejects error/new-user/onboarding/duplicates/wrong service; never exchanges a ticket. Preserve existing callback/session/linking tests.
- [ ] **Step 2: Run targeted browser tests against the unchanged implementation.** Expected: failures for old Gov frontend destination, delayed cleanup and unsupported callback validation.
- [ ] **Step 3: Implement the minimal frontend change.** Use SDK state generation, construct fixed Gov LINE authorization, capture/scrub callback before dynamic app import, pass only allowlisted fields, reject unsupported statuses before code verification. Add no-store to HTML responses and strengthen existing proxy test for headers/logging. Document direct Gov LINE path and limitations.
- [ ] **Step 4: Run npm build and full npm test; build frontend image and run proxy-security test.** Expected: all green; callback status 200, no-store/no-referrer, no credentials in logs. Unchanged backend is covered by CI's full suite.
- [ ] **Step 5: Commit, fresh security review, fix important findings with regressions, PR and deploy to the authorized test site after checks.** Expected: CI/CD successful and live build matches reviewed commit.
- [ ] **Step 6: Perform real authorized LINE sign-in.** Expected: registered callback receives scoped code and matching nonce, server verification succeeds, TownTrack user/session/profile visible. Verify local logout, replay rejection and no new credentials leaked into logs. If the provider contract fails, diagnose the observed boundary and roll back unsafe changes; never invent success or weaken auth.
