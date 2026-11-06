# Municipal UI and Whole-Application Bilingual Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver all six requested UI changes with Thai/English across every existing screen, preserved drafts, and clearly isolated UAT failure simulation.

**Architecture:** Reuse React/Ant Design and the existing APIs. A shared language store, translation catalogs and hook update display text without remounting forms. UI-only workflow guidance uses existing role/action/status keys. UAT gating is an explicitly enabled client simulation and never grants authority.

**Tech Stack:** React 19, TypeScript, Vite, Ant Design 5, existing Mapbox/fallback maps, Playwright. No new runtime dependency required.

**Spec:** docs/superpowers/specs/2026-11-06-municipal-ui-bilingual-design.md

## Global Constraints

- DO NOT change any database schema, table names, or existing backend API endpoint paths/contracts.
- DO NOT alter the core workflow state machine transitions or role keys (CITIZEN, OFFICER, LEADER, FIELD, APPROVER, ADMIN).
- Support 390px, 768px, 1280px and both languages. Language changes do not reload, remount, reset, translate or discard form data/files.
- Translate application UI everywhere. Preserve all administrator/user/server-authored data including category names, privacy policy content, arbitrary notifications, names, departments, filenames, case details and recorded reasons.
- Supervisor appointment is read-only from existing assignment_details; worker selection uses the existing assignment contract.
- Keep Mapbox, 100m duplicate detection, Emergency 199, auth verification, evidence/private-data boundaries and server enforcement intact.
- No production account creation, case creation, reassignment, approval, rejection or evidence mutations as tests.
- New behavior earns meaningful tests; do not add constant/copy-mirroring tests for harmless wording changes.
- User authorized implementation and clarified scope. Proceed without additional process approval questions. Review design and plan concretely; the higher-priority autonomy instruction overrides redundant skill approval/handoff menus.

## Review Focus

- A language change during an open Ant Design portal/modal or pending draft must not reset values, field arrays, files, pin or submission identity.
- Metadata list/detail responses can race on page/account/version changes; an old worker's coordinates or appointment must not appear on a new task.
- UAT cannot hide a sent mutation's unknown outcome, mount a fake auth session, leak controls into normal builds, or leave a portaled actionable dialog over the block screen.
- English UI must not translate user content or silently drop semantic placeholders/formatting; unknown server data is preserved.
- Long Thai role/denial labels and English actions must wrap on all target widths, without clipped controls, horizontal overflow or inaccessible reasons.

---

### Task 1: Language foundation, app shell, authentication and privacy

**Files**
- Create: frontend/src/i18n/core.ts, frontend/src/i18n/useI18n.ts, frontend/src/i18n/messages.ts.
- Create: frontend/src/i18n/locales/shared.en.ts, auth.en.ts, citizen.en.ts, staff.en.ts, admin.en.ts (last three initially empty).
- Create: frontend/src/LanguageSwitcher.tsx.
- Modify: frontend/src/bootstrap.tsx, main.ts, App.tsx, api.ts (client helpers/display labels only), GovAuthPage.tsx, GovAccountForm.tsx, GovLogin.tsx, GovCallback.tsx, GovProfile.tsx, PrivacyGate.tsx, govSso.ts, govCallbackReturn.ts, style.css.
- Test: frontend/tests/language-drafts.spec.ts, existing auth/navigation checks as affected.

**Interfaces**
- core.ts exports Language = "th" | "en"; getLanguage(): Language; setLanguage(language: Language): void; subscribeLanguage(listener: () => void): () => void; translate(message: string, params?: Record<string, string | number>): string.
- Translation source identifiers are the existing Thai UI messages; English catalogs map exact Thai messages (with {{named}} placeholders) to English. Thai returns the original identifier. Use own-property lookup; unknown data stays original. No DOM mutation/automatic translation.
- useI18n() returns { language, setLanguage, t: translate } using useSyncExternalStore.
- messages.ts merges five independent catalogs. Later tasks add only their own catalog; no runtime registry.
- LanguageSwitcher has accessible label "Language / ภาษา", Thai and English choices.
- Existing API date() uses the current UI locale with Asia/Bangkok. api/status/action/role key contracts stay unchanged; render their display labels through t().
- setLanguage persists only "towntrack.language"; blocked storage falls back to memory. Set document.lang. Components subscribe through hook and are never keyed by language.

- [ ] Write a browser behavior test: enter a login/register draft, switch language, observe translated controls with the exact same entered values; reload retains language; account names stay original.
- [ ] Run the test and observe RED because the language control/translated UI does not exist.
- [ ] Implement the shared modules, add language control to auth/header, switch Ant Design locale without changing component identity. Translate all App/auth/privacy UI chrome; keep versioned policy text original.
- [ ] Run TypeScript, relevant existing auth tests and the new language tests; observe GREEN. Log evidence and any intentional baseline selector updates.
- [ ] Commit only Task 1 files and tests.

### Task 2: Citizen screens, contact guidance and attachment UI

**Files**
- Modify: frontend/src/NewCase.tsx, ReporterEmail.tsx, CitizenHome.tsx, CitizenTracking.tsx, CitizenOutcome.tsx, CommunityActions.tsx, CommunityDetail.tsx, EmergencyContacts.tsx, EvidenceGallery.tsx, EvidenceUpload.tsx, AttachmentList.tsx, PdfPreview.tsx, LocationMap.tsx, MapboxLocationMap.tsx, GeoContext.tsx, reportExamples.ts, attachments.ts.
- Modify: frontend/src/i18n/locales/citizen.en.ts.
- Test: frontend/tests/citizen-language.spec.ts; relevant existing report/tracking/location/media tests.
- Shared style additions belong in a uniquely scoped block in style.css.

**Interfaces**
- Consumes useI18n() and translate() from Task 1.
- Shared Detail.tsx translations and final terminal explanation are Task 3; avoid editing that file.
- Preserve source data. reportExamples may accept a language/display translator but must not change category lookup keys or overwrite typed descriptions.
- Share visible-error revalidation through i18n/useLocalizedFormErrors.ts, used by NewCase and the minimally updated GovAccountForm; later tasks consume this hook for their open forms.

- [ ] Write behavior tests that switch language after selecting a point/category and entering a report with an attachment; all values/attachment remain and resulting API payload remains identical.
- [ ] Include privacy data-boundary assertion: custom Thai category and citizen-authored details remain unchanged in English.
- [ ] Observe RED for English citizen controls, implement localization and the new optional phone helper with accurate Gov Center LINE/email wording.
- [ ] Translate every owned screen's UI, validation, loading/error/retry, public outcome and media/map fallback controls, while preserving existing contact privacy and 100m duplicate behavior.
- [ ] Verify English and Thai on mobile plus existing citizen/report/tracking/map regressions; screenshots at 390/768/1280. No new tests solely pinning helper wording.
- [ ] Commit owned files and tests.

### Task 3: Operational guidance, assignment/cards, authority decisions and central staff

**Files**
- Modify: frontend/src/Detail.tsx, StaffWorkspace.tsx, ResourceReview.tsx, Teams.tsx, api.ts (TERMINATED display label only).
- Create: frontend/src/FieldTaskCard.tsx (if needed for bounded card metadata/map rendering).
- Modify: frontend/src/i18n/locales/staff.en.ts, style.css (scoped operational UI).
- Test: frontend/tests/municipal-ui.spec.ts, field-task-cards.spec.ts; update intentionally renamed selectors in municipal-workflow.spec.ts/product-flow.ts/towntrack.spec.ts only as required.

**Interfaces**
- Consumes Task 1 translation interface and translated shared media/map components.
- Existing ASSIGN does not persist appointment: display existing appointment read-only. Existing GET /complaints/{id} provides metadata; preserve list contract.
- Do not globally replace audit history labels with imperative action button labels. Use a display helper distinguishing buttons from events.
- Main Thai text, the three exact rejection presets, action/status contexts, warnings and staff headers are fully specified in the design.
- Consume useLocalizedFormErrors(form) from Task 2 rather than duplicate validation-refresh logic. Selecting a preset fills the currently displayed language once; thereafter its reason is editable data and must not be auto-translated on language changes.

- [ ] Add tests for a declined assignment still requiring a reason and sending existing DECLINE payload; ACCEPT/START still omit reason; changing language in a resource/rejection form preserves current values and row list.
- [ ] Test preset selection followed by manual editing: required reason and original DENY/version/idempotency payload survive; do not assert mocked server outcomes as production behavior.
- [ ] Test stale card-detail response after pagination/account change cannot replace the current task's date/pin, and a metadata error offers retry rather than a fabricated appointment.
- [ ] Observe RED for these new interactions. Implement worker guidance and resource-pending badge only in appropriate stages; direct assignment with existing date; cards showing zero votes and selected single-pin map.
- [ ] Add central staff document/completion review wording and specific return reason label. Add terminal subtitle without hiding actual terminal outcome or inventing follow-up dispatch.
- [ ] Translate all owned UI/error/empty/history/modal states in both languages. Preserve server-authorized actions and all current evidence/resource validation.
- [ ] Run targeted tests and existing operational/approver flows, capture responsive screenshots and verify no horizontal overflow. Commit.

### Task 4: Administration localization and coverage of all application screens

**Files**
- Modify: frontend/src/Admin.tsx, DepartmentPeople.tsx, GovRoleSettings.tsx, AccountDeletion.tsx.
- Modify: frontend/src/i18n/locales/admin.en.ts.
- Test: frontend/tests/admin-language.spec.ts plus existing department/account/Gov role checks.
- App shell and shared media strings already belong to earlier tasks; request interface corrections instead of duplicating localization stores.

**Interfaces**
- Consumes Task 1 translator; role values stay exact existing uppercase keys.
- Consume useLocalizedFormErrors(form) where existing invalid fields must refresh their visible validation language without resetting values.
- Admin-authored category/form/workflow text remains original data in either language.
- Mapping/department/user API shapes, deletion behavior and identity boundaries are unchanged.

- [ ] Write a behavior test: edit an administrator form, switch language with the modal open, retain original entered values and unchanged role/category/request identifiers.
- [ ] Observe RED, localize all owned UI and default labels while avoiding translation of stored admin content.
- [ ] Run existing role mapping, department and deletion browser tests, plus new bilingual behavior; record screenshots at target widths.
- [ ] Commit.

### Task 5: UAT-only fail-closed simulation and truthful Gov badge

**Files**
- Create: frontend/src/uatAuth.ts, UatAuthToolbar.tsx, GovAuthBadge.tsx (split presentational components only if useful).
- Modify: frontend/src/App.tsx, GovAuthPage.tsx, api.ts, vite-env.d.ts, style.css.
- Modify: deploy/Dockerfile.frontend, .github/workflows/deploy.yml (frontend flag for environment cloud-test only).
- Modify: frontend/src/i18n/locales/auth.en.ts (new badge/UAT/auth error UI messages only; preserve existing catalog semantics).
- Test: frontend/tests/uat-auth.spec.ts and a normal-build/browser configuration proving the flag is off by default.

**Interfaces**
- uatAuth.ts owns explicit build-flag eligibility and local simulation state; no role/session creation or server setting.
- Track pending mutations/uploads in client helpers. Block activating simulation while they are outstanding; do not abort already-sent mutations.
- When enabled for a signed-in internal user, prevent new client business requests and present the exact alert in design. Keep underlying drafts mounted, hidden/inert including portaled dialogs and restore original focus/form on exit.
- Normal 503 error handling is scoped to auth endpoints; existing backend remains authoritative.
- Docker build argument defaults false. Only existing cloud-test deployment explicitly supplies true. Preserve all backend build/deploy configuration.

- [ ] Write tests first: UAT denial blocks internal content/new actions, restore recovers a typed modal draft/file list; a pending save disables entry; citizen screen is not blocked; flag=false has no simulation toolbar.
- [ ] Test an actual auth endpoint 503 displays a truthful error without granting access; do not conflate a document 503.
- [ ] Observe RED and implement. Use a "จำลอง / UAT" indicator and explain client simulation rather than claiming an HTTP response changed. Before login use an auth-source badge, not a verified-session claim.
- [ ] Run UAT and auth regressions in enabled and normal builds. Commit.

### Task 6: Integrated bilingual, workflow and release verification

**Files**
- Test: frontend/tests/bilingual-coverage.spec.ts if a page-family navigation test is needed for an uncovered behavior; otherwise extend the earlier tests.
- Update documentation/plan ledger only; fixes go to the owning task/implementer.

**Interfaces**
- Uses all prior tasks. No new product scope and no further approval checkpoints.

- [ ] Audit each frontend source file for untranslated UI, distinguishing actual data/regex/lookup identifiers from visible messages; inspect every application's English page family and both-language responsive screenshots.
- [ ] Verify role/queue/action values and request bodies do not change with language. Verify open portal drafts survive language and UAT restoration. Inspect maps, date, phone/email, terminal outcomes and pending-resource guidance.
- [ ] Run formatting, TypeScript/production build, source hygiene, focused new tests and full browser suite against disposable fixtures. Backend verification in CI remains unchanged.
- [ ] Get fresh whole-branch code review, resolve material findings, rerun checks justified by those fixes. Confirm no backend/schema/workflow/API-contract diff.
- [ ] Commit, create/attach PR, merge after checks, deploy through existing release workflow, and check exact release + safe mocked frontend smoke without production business mutations. Report actual results and any real limitation.

