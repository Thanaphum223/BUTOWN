# Gov registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace citizen local signup with the official Gov signup handoff and authenticate valid new-user returns.

**Architecture:** Reuse GovLogin's CSRF-protected pending LOGIN and the SDK's browser nonce. Add a registration variant that opens Gov's register URL with the configured service/return destination. Keep verification and local session creation on the existing backend.

**Tech Stack:** Existing React/TypeScript, Ant Design, gov-sso-login 1.4.0, Spring, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-gov-registration.md`

## Global Constraints

- Exactly the existing three central ENV variables; no new dependencies.
- No real Gov registration, password entry, consent acceptance or live database writes in verification.
- Code/state verification and CITIZEN defaults remain authoritative; markers never authenticate.
- Provider signup cannot currently guarantee return to the sslip.io callback; report this explicitly.
- Preserve the primary checkout's untracked user files.

## Review Focus

- Signup lasts longer than the pending timeout: no stale state may authenticate.
- Switching between login and signup while a request is pending must not start multiple incompatible transactions.
- Provider omits callback/state or returns onboarding information: never infer identity from sessionStorage or markers.
- New-user markers with invalid/rejected codes must fail without rendering an authenticated app.
- Unconfigured or alternate-origin deployments must not expose a functioning local signup fallback or navigate to a wrong callback.

### Task 1: Registration redirect and verified new-user return

**Files:** Modify `frontend/src/App.tsx`, `GovLogin.tsx`, `govSso.ts`, `govCallbackReturn.ts`; test `frontend/tests/gov-sso.spec.ts`; update `docs/GOV_SSO.md` and `docs/GOV_SSO_CONTRACT.md`.

**Interfaces:** Registration uses `{state, purpose: LOGIN}` on `/api/auth/gov/start`, then Gov `/auth/register` with configured service and callback carrying the same nonce. Valid callback still sends only `{code,state}` to `/api/auth/sso-callback`.

- [ ] Run existing mocked SSO browser suite as baseline. Expected: all existing SSO tests pass.
- [ ] Add tests for direct signup navigation with matching state, no local credential form/API writes, start failure recovery/concurrency, missing config and alternate-origin safety, verified new-user callback home, code rejection and missing-code rejection. Watch new tests RED before implementation. Existing unsafe-return case for `is_new_user=true` changes to the valid-code contract; arbitrary markers remain unsafe.
- [ ] Implement registration variant and remove the local registration UI/submit handler. Allow only boolean new-user markers, leaving all identity and authority decisions to verified code handling.
- [ ] Run SSO suite GREEN, frontend format/build, and dependent mocked navigation tests. Full backend/database/browser/proxy suite runs in CI before deployment completion; do not start local Docker.
- [ ] Update contract docs with actual LINE/registration nonce behavior and provider limits, commit change.
- [ ] One fresh whole-branch security/functional reviewer; fix Important/Critical findings once with RED→GREEN tests. Minor issues are deferred.
- [ ] Create/attach PR, merge under prior authorization, verify main full CI and deployment; read-only Cloud navigation proof and aggregate data/file comparison. Do not submit a real registration.

**Completion:** Our signup navigation and callback receiver verified; deployment health/data intact. Explicitly distinguish simulated successful new-user return from the provider's unverified/unsupported automatic signup return.
