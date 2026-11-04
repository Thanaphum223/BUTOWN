# LINE Re-login Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LINE sign-in works immediately after logout without reloading.
**Architecture:** Match the existing Gov email flow by obtaining a current session CSRF token before a user-initiated LINE transaction starts. Keep central verification unchanged.
**Tech Stack:** React/TypeScript, Playwright; existing Spring session/CSRF.
**Spec:** docs/superpowers/specs/2026-11-04-line-relogin.md

## Global Constraints
- No real account registration or credential logging.
- Keep Gov-only auth, CSRF, single-use state and duplicate-submit protection.
- No blind request retries or replayed codes; no backend authorization changes.

## Review Focus
- Logout invalidates the old session token; the next explicit sign-in must use the new token.
- LINE LINK and anonymous LOGIN preserve their original purposes and failure recovery.

### Task 1: Reproduce and fix stale CSRF
- [x] Add a regression that rotates the mock CSRF/session on logout and completes two LINE sign-in cycles without reloading before each start.
- [x] Run it against current source: expected redirect missing and กรุณาเข้าสู่ระบบ, proving the stale token at /auth/gov/start.
- [x] Refresh CSRF before starting the LINE transaction, following GovAccountForm's existing pattern.
- [x] Run the regression and all Gov auth browser tests, formatting/build/source hygiene.
- [ ] Review, commit, PR and merge; complete full main CI and cloud deployment.
- [ ] Verify live routes/config/data and the requested admin assignment. No live signup.
