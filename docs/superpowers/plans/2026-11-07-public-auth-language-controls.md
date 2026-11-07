# Public authentication language controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the language dropdowns shown in the user's login/callback screenshots and retain only the authenticated header dropdown.
**Architecture:** Remove LanguageSwitcher imports/rendering from standalone auth boundaries and the unused auth-heading selector CSS. Preserve the shared language provider and App header. Adapt existing tests tied to the removed UI.
**Tech Stack:** React/TypeScript, Playwright, existing Java/PostgreSQL CI.
**Spec:** docs/superpowers/specs/2026-11-07-public-auth-language-controls-design.md

## Global Constraints
- Keep the single authenticated application-header language control.
- Remove standalone controls from GovAuthPage (both login and registration), GovCallback (loading/error), and PrivacyGate (loading/error/policy).
- Retain stored-language initialization, translations, form state, genuine Gov/CSRF/error handling, callback verification, privacy acknowledgment and original data.
- No backend, API, dependency or permission changes. No live business writes. No machine sleep.
- Adapt existing tests; do not add tests that merely mirror this low-impact removal.

## Review Focus
- Login and registration use the same page; neither may leave a hidden/focusable selector.
- Callback loading/error must keep original security/error/restart behavior.
- Privacy loading/error/policy must preserve acknowledgment and original notice text.
- Stored English must remain usable without a standalone selector; original error detail must remain untranslated.
- Authenticated header and its locale/draft behavior must remain available.

### Task 1: Remove standalone selectors and adapt affected regressions

**Files:** Modify frontend/src/GovAuthPage.tsx, GovCallback.tsx, PrivacyGate.tsx, style.css; affected existing frontend/tests/clean-auth.spec.ts, language-drafts.spec.ts, auth-unavailable.spec.ts and any concrete dependent fixture only.
**Interfaces:** Consumes shared LanguageSwitcher/useI18n and existing auth/SSO APIs. Produces unchanged APIs with the selector rendered only in App header.

- [ ] Inspect affected tests and preserve meaningful form/data/auth/503 assertions while removing obsolete standalone-switch expectations. Existing header tests remain unchanged unless a concrete dependency requires adaptation.
- [ ] Verify an updated existing auth-boundary expectation rejects the old selector before the JSX removal.
- [ ] Remove imports/rendering in all three components and the unused .auth-heading > .language-switcher CSS rule. Do not touch production auth behavior.
- [ ] Run tsc, format/source hygiene, and existing auth/SSO/language/privacy/header regressions with mocked APIs; full backend/browser/build/proxy suites run in repository CI. Expected: all affected tests pass with zero skipped/force-click/retry workarounds.
- [ ] Commit and report exact changed files, commands/results, limitations. Root owns reviews, PR/main CI, deployment and served-asset proof.
