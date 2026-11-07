# Clean Interface and Approver Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox syntax.

**Goal:** Remove redundant language and all UAT simulation UI/code; give approvers a safe municipal summary while retaining personal detail/decision access.
**Architecture:** Existing language/auth infrastructure plus an opt-in restricted summary mode on the existing complaint list; a separate approver dashboard consumes only that minimal list.
**Tech Stack:** React, TypeScript, Ant Design, Playwright, Spring Boot/PostgreSQL.
**Spec:** docs/superpowers/specs/2026-11-07-clean-interface-approver-overview-design.md

## Global Constraints
- The user explicitly confirmed overview totals/status lists for all municipal cases, with details/documents limited to assigned cases.
- No schema/migration/API path/role key/workflow transition changes. Existing default endpoint behavior stays intact.
- Keep real auth/CSRF/Gov 503 handling and original provider details; remove simulation only.
- Retain only authenticated-header and standalone auth/callback/privacy language selectors; preserve bilingual state and ordinary draft/file/payload behavior.
- Keep source-authored data unchanged, attachment/map/privacy/tenant enforcement intact.
- No live account/case/approval/evidence mutations as tests.
- Routine PR and cloud-test release are authorized by the ongoing task context. Do not reopen redundant process approval menus.

## Review Focus
- An approver cannot use the overview flag to read another municipality or private details/files/actions.
- Dashboard and personal queue navigation cannot retain an overview query, filter or unauthorized selected detail.
- Removing simulation wrappers cannot change CSRF, cancellation, uploads, duplicate-submission protection or real auth outage handling.
- Only one necessary language control exists per active screen; dialogs have no duplicated tools.
- Overview includes terminal cases and global totals; failed or late requests cannot show stale account/filter data.

### Task 1: Remove UAT and redundant overlay controls
**Files:** frontend/src/{DialogTools,UatAuthToolbar,uatAuth}.tsx/ts; their consumers in App/GovAuthPage/Admin/Detail/Teams/NewCase/CommunityDetail/PdfPreview/AttachmentList/GovProfile/DepartmentPeople/AccountDeletion; api.ts, style.css, vite-env.d.ts, i18n/locales/auth.en.ts; frontend/playwright.config.ts; deploy/Dockerfile.frontend; .github/workflows/deploy.yml; affected frontend tests.
**Interfaces:** Retain LanguageSwitcher and useI18n interfaces; retain AuthUnavailableError/detail/real error classification and API/post/upload contracts. Remove all imports/calls of simulation state; no noop simulation shims.
- [ ] Write focused behavior coverage for a single header selector and no dialog controls, original form payloads, and no enabled simulation even with the obsolete build flag supplied to a temporary test server. Observe expected RED.
- [ ] Remove simulation components/store/request tracking and build wiring, overlay tools and obsolete styles/catalog entries. Keep main/standalone selectors. Preserve genuine auth-503 tests by moving them out of simulation-only tests.
- [ ] Adapt tests whose obsolete dialog-language/UAT requirements are intentionally removed; preserve meaningful bilingual, data, privacy and request assertions. Do not weaken assertions with arbitrary first/last matches.
- [ ] Verify focused clean-interface, bilingual, auth/Gov, file/PDF and workflow tests, TypeScript, formatting and source hygiene. Full backend/browser/build CI is the integrated gate after both tasks.
- [ ] Commit task files and write task-1-report.md with RED/GREEN, exact command/count, changed tests and remaining concerns.

### Task 2: Restricted municipal overview for approvers
**Files:** backend/src/main/java/th/go/towntrack/ComplaintController.java; backend/src/test/java/th/go/towntrack/ApproverOverviewIntegrationTest.java (or existing integration test); frontend/src/ApproverOverview.tsx, App.tsx, i18n/locales/staff.en.ts, scoped style.css; frontend/tests/approver-overview.spec.ts.
**Interfaces:** GET /api/complaints accepts optional overview=true only for APPROVER. Existing items/total/page/size/stats response projection unchanged; default scope remains personal (admin-as-approver legacy queue scope remains as implemented). The dashboard uses overview mode, existing personal queue uses the default path. No change to Access, file guards or Workflow.
- [ ] Write backend integration cases: same-tenant assigned/unassigned/unrouted/closed/rejected/terminated cases included; foreign tenant excluded; default queue/details/files/decision access unchanged; non-APPROVER overview forbidden; invalid overview/history or queue combinations rejected. Observe RED.
- [ ] Implement restricted list scope, bind parameters safely, preserve global stats semantics and existing filters. No contact/reporter/evidence fields in summary projection.
- [ ] Write browser behavior tests for global stats/all-status rows without detail links or prefetch, navigation to personal queue with assigned-only details, filters/pagination and failure/stale response handling. Observe RED.
- [ ] Implement dedicated bilingual responsive read-only overview; preserve existing queue and approval actions. Check 390/768/1280 in both languages.
- [ ] Run relevant backend/browser tests and shared regressions, TypeScript/format/hygiene. Commit and write task-2-report.md.
- [ ] Require final whole-branch review, full isolated CI, PR merge, main CI/deploy and read-only release plus mocked served-UI checks before completion.
