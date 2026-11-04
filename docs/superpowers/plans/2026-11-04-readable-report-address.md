# Readable report location implementation plan

> Execute inline using superpowers:executing-plans with one fresh whole-branch review.

**Goal:** Show a readable place/address in the report wizard, keep coordinates in the GPS section, and never silently substitute coordinates when reverse lookup fails.

**Architecture:** Retain configured Mapbox/Nominatim-compatible server geocoding and its global rate limit/cache. Replace the frontend coordinate fallback with an empty address, loading/empty/failure notices and an explicit retry. Preserve manually typed addresses, selected search results, and discard stale asynchronous responses. Cloud initially had neither geocoding endpoint nor Mapbox token; the user selected free Nominatim for this test site after reviewing its policy, rate and privacy restrictions. Activate only via the Cloud ENV, with no public default in source.

**Tech stack:** React/Ant Design, existing Spring geocoding proxy, Playwright.

**Spec:** User screenshot shows `พิกัด ...` in สถานที่ / จุดสังเกต even though coordinates are below. They want actual location details there. Existing user authorization delegates implementation and deployment choices; the user selected Nominatim for this test site.

## Constraints / review focus

- Never fabricate a street/place name from coordinates; keep GPS values unchanged and in their own controls.
- Never overwrite an address edited while a reverse request is pending; ignore canceled/older point results.
- Keep search selection and manual address workflows functional when the provider is disabled, unavailable or returns no address.
- Preserve source attribution and configured provider support. No new credentials, fees, public provider defaults, SSO/role/database changes.
- If Nominatim is selected: user-informed choice, max 1 request/second across the single server, server cache and explicit search only; no autocomplete or bulk calls. Validate using public test locations only.

## Task 1: Readable address and honest fallback

- [x] Write regressions for successful readable prefill, failed/empty lookup with no coordinate substitution, explicit retry, manual edits during pending request, and stale responses after changing the point.
- [x] Watch the missing behaviors fail; then remove both coordinate-fill paths and show loading/failure/empty states with an address retry.
- [x] Keep coordinate controls unchanged and confirmation/save using the readable/manual address.
- [x] Verify full frontend suite, production build/format, backend contract and source hygiene checks; production proxy unchanged and checked by main CI.
- [ ] Fresh branch review; commit, PR, main CI/CD and live verification without submitting a real complaint.

## Task 2: Provider readiness

- [ ] Apply only the provider selected by the user, after verifying its requirements and without printing secrets.
- [ ] If no provider is approved, leave it disabled and clearly report the remaining dependency; complete the frontend correction independently.
- [ ] Verify the selected provider using a public fixture point, and the live wizard after rollout; preserve all production accounts, reports, votes and files.

## Evidence

- NewCase.tsx fills the address with coordinates both on point selection and initial mount, then swallows reverse-lookup failures.
- Read-only Cloud inspection: GEOCODING_BASE_URL blank, MAPBOX_GEOCODING_TOKEN blank. Reverse lookups therefore cannot return place names.
- Baseline main cc9dba5 passed 95 backend and 52 browser tests in GitHub CI immediately before this task.

- Pre-review verification: backend 97/97, browser 57/57, production frontend build/format and source hygiene passed. Same-GPS regression additionally watched RED→GREEN.
- Nominatim responded HTTP200 from Cloud for a public fixture point. Approved GEOCODING_BASE_URL staged in Cloud .env with protected backup and valid Compose config; activation waits for verified release.
