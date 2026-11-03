# Three Gov Settings Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The user explicitly requests implementation and delegates routine decisions.

**Goal:** Require only E_SERVICE_API_KEY, E_SERVICE_CODE and GOV_CALLBACK_URL for central Gov integration.
**Architecture:** Fixed official Gov auth/API endpoints; server-bound local municipality selected from the application's own database when starting a request. Explicit LINK uses the authenticated local account's municipality. Anonymous LOGIN with zero/multiple municipalities fails clearly rather than choosing a tenant silently. Existing local authentication, one-use state and local permissions stay authoritative.
**Tech Stack:** Spring Boot/Java21, PostgreSQL, React/gov-sso-login1.4, Docker Compose.
**Spec:** User's 2026-11-03 instruction: only the three pictured central Gov environment settings; do not change unrelated database/storage/LINE settings.

## Global constraints
- No central user/municipality identifier is trusted as a local tenant ID.
- No API key in frontend, output or Git; no removal of state or CSRF checks.
- Use https://auth.govcenter.co and https://api-auth.govcenter.co from the guide as constants.
- Remove obsolete Gov endpoint/mode/municipality environment switches and obsolete mandatory-central-only gate; retain ordinary authenticated local access and all local authorization checks.
- Pending login captures municipality once; account linking rechecks that account and municipality before provider exchange.

## Review focus
- Zero/multiple local municipalities must not silently bind identities to a random municipality.
- LINK must use the authenticated account's municipality and reject an account moved between start and callback.
- Adding another municipality after start must not change the pending login's target.
- Legacy Gov environment overrides must not redirect the API key or alter official provider endpoints.
- Preserve enabled flags, explicit linking, one-use state, logout/session ordering and local role authorization.

## Task 1: Implement and test three-setting protocol
- [x] RED: remove municipality/endpoint settings from SSO test config and observe configured=false with only the three settings before implementation.
- [x] Fix official endpoint constants, three-setting validation, tenant resolution/pending binding; remove unused mandatory-central mode setting/gate.
- [x] Extend real-HTTP-boundary tests with only-three-settings success, ambiguous/absent local municipality, multi-tenant explicit LINK, pending tenant stability and changed LINK municipality rejection. Keep production request endpoint assertion while redirecting transport in test code only.
- [ ] Run focused tests then full backend verify; frontend/browser/production proxy verification through CI.

## Task 2: Config and delivery
- [x] Update active Compose/examples/setup docs to exactly three central settings; retain unrelated settings.
- [ ] Review, commit/push PR, verify CI and integrate/deploy under existing user authorization.
- [ ] Remove retired Gov-only keys from Cloud ENV after new code is healthy, recreate backend, confirm only three required settings and single local municipality resolution. Update local images/containers without replacing DB volumes.
- [ ] Verify real cloud/local public config, CSRF/state rejection, data preservation and report actual live provider result without claiming successful SSO absent a real returned code.

Verification before push: original public-config test was RED with configured=false using only3settings. Focused30/30 and fresh clean backend90/90 passed0fail/error/skip. Source hygiene/diff checks passed. Independent review found no Critical/Important issue.
