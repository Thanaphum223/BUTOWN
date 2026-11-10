# Workflow recovery and automatic refresh implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let central officers recover an undispatched case whose assigned head can no longer act, and replace manual refresh controls with automatic reads.

**Architecture:** Add a narrowly checked REASSIGN_LEADER action for TRIAGED cases with an unavailable head and no work orders. Use one shared, cancellable live-query hook for case lists/details; suspend detail polling while forms/uploads are active. Keep authentication, role checks, version checks, and idempotent writes intact.

**Tech Stack:** Spring JDBC/PostgreSQL, React, Playwright.

**Spec:** User request of 2026-11-10; production #0FF22F37 is TRIAGED and assigned to a disabled head. No work orders were found in the screenshot stage. Verify this guard against the database in regression tests.

## Constraints and review focus
- Never select a replacement automatically or alter production cases as a test.
- Recovery requires an enabled LEADER/ADMIN in the same municipality and assigned department; valid existing assignments and previously dispatched cases cannot be taken over.
- Record actor, time, reason, former head, and new head in the audit history.
- Background reads must not reset forms, replay writes, overlap, or publish stale responses across case/account changes.
- Refresh visible screens every four seconds and when connectivity/focus returns; preserve data on transient read errors and recover automatically.

## Task 1: Recover unavailable head assignments
- [x] Add failing integration tests for disabled/missing/changed-role heads, valid assignments, dispatched cases, scope/department/version enforcement, queue discovery and audit history.
- [x] Verify RED, implement policy/action and same-department replacement selector, verify GREEN.

## Task 2: Replace refresh buttons with automatic reads
- [x] Add failing browser tests for all staff roles receiving fresh action buttons, citizen/approver lists, draft preservation and no write replay.
- [x] Verify RED, implement shared serial/abortable query lifecycle and remove reload controls. Retain mutation-triggered reads.
- [x] Run focused regressions, TypeScript/format/backend checks; request one fresh whole-branch review.
- [ ] Create/attach PR, complete CI, merge and verify deployment before reporting completion.

## Execution evidence
- Production read-only audit: #0FF22F37 has a disabled former head, zero work orders, and one eligible replacement head.
- Backend RED: recovery action absent (404), normal queue includes other roles' stages.
- Backend GREEN: 198 tests, zero failures/errors; package verification passed after clearing duplicated ignored build cache files.
- Browser RED: open details did not refresh; failed post-submit read removed the action draft.
- Fresh branch review identified that transient refresh errors must retain cached forms. Fixed with explicit 401/403 cache removal and read-only retries after a failed forced refresh.
- Active queue scope added after the user's follow-up; municipal approver summaries and history remain unchanged.
- Final focused browser run: 26 passed, including four-role polling, replacement head form, no overlapping reads, draft recovery and revoked-access cache clearing. TypeScript, formatting and source hygiene passed. Fresh reviewer rechecked the correction without further findings.
