# Citizen map and missing-data recovery

> **For agentic workers:** Use superpowers:executing-plans inline. Check each task before continuing.

**Goal:** Restore usable citizen maps and make existing municipal complaints discoverable when the selected 5 km area is empty.

**Architecture:** Keep nearby search as the default. Add an explicit municipality scope to the same sanitized, tenant-bound community API. Scope changes never alter complaint ownership, account roles, coordinates, or production records. Send only the origin as the tile request Referer while keeping the site's no-referrer policy.

**Tech Stack:** Spring Boot / PostgreSQL PostGIS, React / Ant Design / Leaflet, Playwright.

**Spec:** User's 2026-11-04 screenshot and complaint that map rendering broke and data disappeared; production read-only audit confirms 31 complaints, 311 votes, 30 complaints outside the default center's 5 km radius.

## Global Constraints

- Preserve SSO state validation, callback no-referrer protection, local roles, tenant boundaries and sanitized public summaries.
- No production seeding, deleting, moving, identity merging, or permission changes.
- No new tile provider, bulk tile fetching, cache disabling, proxying, or user-agent spoofing.
- Default nearby scope remains exactly 5,000 metres; municipality scope must be selected explicitly.

## Review Focus

- Other-tenant records never appear in either list, totals, rankings or media.
- Invalid scope and missing/non-finite nearby coordinates fail with 400.
- Empty areas and category filters remain clear and can be changed without getting stuck.
- Switching scopes clears the previous radius, pagination and stale result display.
- Mobile and narrow desktop metrics fit; tiles send no URL query/path credentials.

### Task 1: Safe explicit municipal discovery

**Files:** ComplaintController.java, TownTrackIntegrationTest.java, CitizenHome.tsx, style.css, tests/community-area.spec.ts.

**Interface:** GET /api/community/complaints adds scope=nearby|municipality (default nearby); coordinates required only for nearby. Both scopes return municipalityTotal for the active category. All existing sanitized fields and paging remain.

- [x] Write backend regressions for outside-radius municipal discovery, tenant and category isolation, sanitized fields, ranking and invalid inputs; observe expected failures.
- [x] Implement scope validation and shared tenant/category predicates without widening private APIs.
- [x] Write browser regressions for an empty 5 km area that can explicitly discover existing municipal data, switch back, and retain category and pagination behavior; observe expected failures.
- [x] Add scope control, truthful scoped totals/empty state, and responsive metric value/label layout; show an em dash for an unavailable ratio.
- [x] Run backend and browser verification and commit the coherent change.

### Task 2: Tile request privacy and deployment

**Files:** LocationMap.tsx, tests/community-area.spec.ts.

**Interface:** Leaflet tiles use referrerPolicy=origin; auth callbacks and other requests retain their existing no-referrer behavior.

- [x] Add a browser test served with no-referrer policy, capture tile requests at a local controlled HTTP boundary, and assert origin-only Referer with no callback credentials; observe failure before changing the tile layer.
- [x] Set tile-specific origin referrer policy and clear old selected marker/radius when value is removed during scope changes.
- [x] Run complete backend/frontend/proxy checks, request a fresh whole-branch review, and address consequential findings.
- [ ] Commit, publish PR, merge after successful CI, deploy through CI/CD, verify the live map and unchanged database counts, and capture user-facing proof.

## Execution ledger

- Initial evidence: 31 complaints, 311 votes; no deleted data. All previous user untracked files preserved in the primary checkout.
- Worktree created manually after the native tool returned Not a git repository for the projectless chat.
- User has already authorized implementation decisions and test-site deployment; execute inline without another design/approval pause.
- Final: fixed repeated identical map selection clearing results without refetch — reselecting identical map coordinates regression RED (expected count, received em dash) → GREEN; complete browser suite 49/49.
- Backend Maven verify 93/93; frontend format/build passed; disposable production proxy checks passed, including callback no-referrer/no-store and credential-free logs. Build retains the existing bundle-size advisory.
- Fresh reviewer found no Critical or Minor issues, no declined-to-judge behaviors; the one Important state issue above is fixed.
