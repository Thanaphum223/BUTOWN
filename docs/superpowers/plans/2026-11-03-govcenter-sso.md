# Gov Center SSO Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. The user delegated execution and design details.

**Goal:** Implement documented one-time-code IAM-GOV SSO for citizens and staff with local authorization and residence synchronization.
**Architecture:** CSRF-protected server-bound state, backend HTTP verify-code client, transactional identity/profile sync, React library redirect with local callback transport, existing session authentication.
**Tech Stack:** React 19/Vite, gov-sso-login 1.4.0, Java 21/Spring Boot, PostgreSQL/Flyway.
**Spec:** docs/superpowers/specs/2026-11-03-govcenter-sso-design.md

## Global Constraints
- API key server-side only; no token/secret logs or URL credentials.
- New identities CITIZEN, existing local permissions/passwords preserved; no email/name auto-link.
- Missing, expired, reused or mismatched state and invalid provider data fail closed.
- Configure without credentials; keep local cloud login available.

## Review Focus
- Link attempt after session identity changes must not bind the wrong local account.
- Concurrent identity creation/linking cannot steal or duplicate accounts.
- Provider timeouts/one-time-code ambiguity require a fresh login, not blind retries.
- Partial, pending and empty residence data must not leave stale verified memberships.
- StrictMode/refresh callbacks must not exchange the code twice or strand the screen.

## Task 1: Backend protocol and identity synchronization
- [ ] Add integration tests with real DB/local HTTP IAM stand-in covering config/state, HTTP exchange and login/link/role preservation, failures and residence sync; run RED.
- [ ] Implement CentralGovAuthController, GovCenterSsoClient and GovIdentityService, migration V20, security routes/limit and cookie behavior.
- [ ] Run focused tests GREEN, full backend suite; fix regressions and commit.
Interfaces: /api/public/gov-auth; POST /api/auth/gov/start {state,purpose}; POST /api/auth/sso-callback {code,state}; local session and IAM identity tables.

## Task 2: React SSO and account linking
- [ ] Add browser boundary tests for login redirect, mandatory state, one callback request and successful session transition; run RED.
- [ ] Pin gov-sso-login; replace GovLogin, add callback and link component, wire App callback/header.
- [ ] Build and run browser suite using real UI and mocked external API boundaries; commit.
Interfaces: task 1 public config/start/callback, API helper CSRF refresh, existing auth/me.

## Task 3: Config, review and delivery
- [ ] Update example cloud/local configuration and rollout documentation including account linking and callback registration.
- [ ] Run full applicable tests, request whole-change review, address material findings, reverify.
- [ ] Integrate/push with existing user authorization and verify CI/deploy; no cloud SSO enforcement without credentials.
