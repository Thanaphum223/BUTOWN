# Municipal Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all ten user-reported workflow/evidence issues without losing history or weakening role boundaries.

**Architecture:** Extend existing Spring/Postgres workflow with explicit operational handoff policy and a transfer table. Preserve published workflow snapshots. Add sanitized historical views and role-specific actionable filters; keep React/Ant UI aligned with server policy.

**Tech Stack:** Java 21, Spring Boot, PostgreSQL/PostGIS, React 19, Ant Design, Leaflet, PDF.js, JUnit/MockMvc, Playwright.

**Spec:** docs/superpowers/specs/2026-11-05-municipal-workflow-design.md

## Global Constraints

- Only FIELD initiates resource requests; existing legacy requests remain completable.
- LEADER returns only before field dispatch. Handoff is intra-municipal and OFFICER-controlled.
- Retain complaint number, original deadline, reports/evidence and append-only audit.
- Use isolated test data; no real business decisions or registration as QA.
- Changes must work for current open complaints without rewriting published workflow versions.

## Review Focus

- A former participant must not gain access to later departments' private data or write operations.
- A declined field work order must not allow LEADER to return a previously dispatched case as never dispatched.
- Concurrent handoff/assignment and stale forms must not create duplicate active work or partially transfer records.
- Old resource requests and multi-department report revisions must continue to select the correct current report/resource.
- PDF authorization/session errors and supplementary video/PDF upload success must be observable, not masked by generic empty UI.

### Task 1: Workflow reasons, resource initiation and rejection history

**Files:** Workflow.java, Access.java, ComplaintController.java; new WorkflowPolicy.java and MunicipalWorkflowIntegrationTest.java.
**Interfaces:** WorkflowPolicy supplies action rules and reason policy; Workflow.actions returns authorized current operations; historical detail uses an explicit read-only query flag.
- [x] Add failing integration tests: leader cannot initiate resource request even with legacy stored transition; ACCEPT/START work without reason; empty decline fails; LEADER return succeeds before dispatch, fails after any dispatch; returned/declined work is visible read-only in own history and inaccessible across municipalities.
- [x] Run targeted tests, record expected failures.
- [x] Implement role/reason policy, audit snapshots, return operation and sanitized history projection.
- [x] Run targeted tests and existing backend suite; update obsolete setup fixtures while retaining one legacy-resource compatibility scenario.
- [x] Commit policy/history changes.

### Task 2: Sequential department handoff

**Files:** new V24__department_transfers.sql; Workflow.java/WorkflowPolicy.java; ComplaintController.java; EvidenceMedia.java; Detail.tsx; api.ts; CitizenHome.tsx/CitizenTracking.tsx.
**Interfaces:** transfer records carry source/target departments, requesting leader, report, reason and state. New actions use targetDepartmentId and leaderId; return/transfer actions require reason. Public projection includes safe receiving-department progress text.
- [x] Add failing end-to-end integration cases for complete A report -> request transfer -> OFFICER queue -> B assignment -> B field report -> overall closure, preserving A records and deadline.
- [x] Add rejection cases for self/foreign department, foreign leader, missing report/evidence, stale version, and duplicate dispatch; assert no partial writes.
- [x] Implement transfer storage and operations with current access guards and transactional locks; add UI fields and public progress.
- [x] Verify targeted cases and backend suite.
- [x] Commit handoff changes.

### Task 3: Resource forms and evidence readers/uploads

**Files:** Detail.tsx, ResourceReview.tsx, EvidenceUpload.tsx, PdfPreview.tsx, Workflow.java; browser tests and integration tests.
**Interfaces:** PROPOSE always requires lineItems; evidence upload exposes persisted success/error and supplementary file list. PDF reader retains authenticated access and provides meaningful failures/retry.
- [x] Reproduce resource-panel/PDF failures with real rendered PDFs and authorized roles before fixing them.
- [x] Add failing cases for missing/empty items, undeletable first row, invalid price input, supplementary PDF/video persisted through report submit, visible upload failure/success, and staff PDF render/navigation.
- [x] Implement strict validation and evidence UI fixes; preserve original download and permission controls.
- [x] Verify targeted browser/backend cases and full backend suite.
- [x] Commit resource/evidence changes.

### Task 4: Actionable role queues and whole-flow validation

**Files:** StaffWorkspace.tsx, new roleQueue policy as needed, ComplaintController.java; browser regressions.
**Interfaces:** inbox group maps user-facing groups to relevant server statuses; history includes own declined/returned work without granting access to future private data.
- [x] Add failing browser/API cases for each role's useful filters and action-specific reason fields; test return history and department handoff through the UI.
- [x] Implement grouped filters and matching labels; retain ADMIN monitoring and citizen progress.
- [ ] Run frontend type/build/format, all backend tests and full browser suite. Review every failed output.
- [ ] Obtain fresh whole-branch review, fix substantive findings with regression tests, integrate/deploy and verify read-only live behavior.
- [ ] Clean up only this task's disposable test resources; report actual validation and remaining material limits.
