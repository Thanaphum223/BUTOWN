# Department Management and Interface Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove redundant interface prose, align header controls to the right, theme language selection, remove font controls, and support department rename/removal and multiple field personnel.

**Architecture:** Preserve React/Ant Design controls and existing role boundaries. Use an atomic administrator endpoint for adding multiple field accounts. The user selected removal only after active dependencies are moved, with historical references retained. Soft retirement preserves these foreign keys and excludes the department from new routing.

**Tech Stack:** React 19, TypeScript, Ant Design 5, Spring Boot, PostgreSQL, Playwright, JUnit.

**Spec:** User request and five screenshots on 2026-11-10. Existing municipality and identity boundaries remain authoritative.

## Global Constraints

- Green municipal theme, Thai/English, accessible keyboard controls, no horizontal page overflow.
- Remove decorative instructions, slogans, redundant summaries and technical explanations; retain labels, validation, errors, useful empty states and consequential action confirmations.
- Only administrators manage departments and accounts, scoped to their municipality.
- Multi-account assignment is atomic and must not demote administrators or select disabled/deleted accounts.
- Never delete complaint history or change live business data to test this change.
- Existing full verification at base 5ed086c passed 198 backend and 287 browser cases.

## Review Focus

- A batch containing an invalid account must change no accounts.
- Department deletion must not invalidate pending work, category routing, staff membership or historical foreign keys.
- Header controls must reach the right edge without overlapping long identity labels at desktop/tablet/mobile widths.
- Language switching must retain current form drafts and remain accessible.
- Failed management requests must leave the dialog and chosen values available for retry.

## Task 1: Header and language controls

**Files:** `frontend/src/App.tsx`, `frontend/src/LanguageSwitcher.tsx`, `frontend/src/style.css`, relevant header/browser tests.

- [x] Remove font-size state, control and unused CSS.
- [x] Align account controls to the right while preserving mobile menu and responsive wrapping.
- [x] Theme the existing native language control with green tokens, visible keyboard focus and readable options.
- [x] Verify desktop/tablet/mobile positions, both languages and no font button.

## Task 2: Redundant interface prose

**Files:** Staff overview/workspace, citizen and other page components; administrator prose handled with Task 4.

- [x] Audit user-facing descriptions and remove redundant instructions/slogans like the screenshot, keeping functional labels and necessary feedback.
- [x] Adjust affected assertions to intended copy removal; retain workflow behavior tests.
- [ ] Verify the key pages in both languages.

## Task 3: Department management backend

**Files:** `backend/src/main/java/th/go/towntrack/AdminController.java`, relevant administration/integration tests, migration if required.

- [x] Add failing tests for municipality-scoped rename, removal policy and atomic multiple field assignment, including invalid/cross-town/admin/disabled accounts.
- [x] Add rename and batch endpoints using existing transaction, audit and session revocation patterns.
- [x] Implement the user's approved deletion policy while preserving history.
- [x] Run focused backend tests, then the full backend suite.

## Task 4: Department management UI

**Files:** `frontend/src/DepartmentPeople.tsx`, `frontend/src/Admin.tsx`, `frontend/src/i18n/*`, `frontend/tests/department-people.spec.ts`.

- [x] Add rename and deletion dialogs with busy guards, inline failure feedback and explicit confirmation.
- [x] Permit multiple field accounts in one selection/save; keep existing head assignment behavior.
- [x] Remove administrator preambles while retaining account identifiers for disambiguation.
- [x] Verify multiple assignment, edit, cancellation, deletion policy feedback, failure/retry and mobile layout.

## Task 5: Integration and release

- [x] Run formatting, TypeScript and source hygiene; review the complete diff independently.
- [ ] Run the full existing CI suite and fix concrete regressions before merge/deployment.
- [ ] Deploy the verified release and confirm matching server images, HTTPS health and changed public assets.

## Verification record

- Header/management representative RED: six expected missing-behavior failures before implementation.
- Focused header/green-theme/citizen/management: 29 passed on first combined run; follow-up corrected multi-select test focus and explicit editor accessible names, then all 16 department/citizen cases passed.
- Backend clean isolated verification: 252 passed, including 54 new cases. Initial missing scanner configuration and stale generated class artifacts were resolved only in the task-owned test runtime.
- Independent review found complaint creation could race retirement. Fixed with municipality then department locks and two PostgreSQL regressions observed RED→GREEN. Final isolated backend clean verification: 254 passed, zero failures/errors/skips.
- Review also identified stale header department options after administration edits. Immediate shared-catalog update and regression observed RED→GREEN; 39 focused authentication/department cases passed after this change.
- Independent bounded follow-up review found both issues resolved with no remaining important findings. Full mocked browser and CI verification remain release gates.
