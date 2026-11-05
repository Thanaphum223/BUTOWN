# Department Heads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign heads and resource approvers directly from each department row.

**Architecture:** A focused DepartmentPeople React component owns the department roster and contextual assignment modal. It consumes the existing admin configuration and role-assignment API. Admin reloads the configuration after a successful save.

**Tech Stack:** React 19, Ant Design 5, TypeScript, Playwright, existing Spring Boot role API.

**Spec:** docs/superpowers/specs/2026-11-05-department-heads-design.md

## Global Constraints
- Keep LEADER and APPROVER separate; one account has one primary role.
- Use existing enabled local accounts and the audited role API; exclude administrators from this shortcut.
- Fix the department/role from the selected action; no new accounts or production role changes during testing.
- Keep shared green theme and accessible mobile/desktop controls.

## Review Focus
- Same names in different departments: contextual actions must submit the row's exact department ID.
- Staff changing role/department: explain the replacement and update both affected rosters after save.
- Disabled/admin/already assigned accounts: do not offer them as shortcut candidates.
- Network error or double click: keep recoverable form and submit once.
- Mobile width: keep the table locally scrollable and modal inside the viewport.

### Task 1: Contextual department assignment

**Files:** Create frontend/src/DepartmentPeople.tsx, frontend/tests/department-people.spec.ts. Modify frontend/src/Admin.tsx.

**Interfaces:** Consumes departments {id,name}[], users {id,username,display_name,role,department_id,enabled}[], refreshing:boolean, onRefresh:()=>Promise<void>. Produces POST /admin/users/{userId}/role with the literal role LEADER or APPROVER and selected row departmentId. Successful submission calls onRefresh.

- [ ] Write browser tests for assigning each role in two different departments, visible role replacement, candidate filtering, cancel, failed save/retry, single submission, refresh, and widths 440/1280. Expected payloads are literal fixture IDs/roles.
- [ ] Run `npm test -- tests/department-people.spec.ts --max-failures=1`; expect failure because contextual assignment controls are absent.
- [ ] Implement DepartmentPeople with explicit role/department summary, searchable existing-account select, current-role warning, guarded submit, and roster table. Replace only the department table in Admin, preserving เพิ่มหน่วยงาน. Expose configuration load errors above all tabs.
- [ ] Run focused tests and green-theme tests; expect all pass. Run frontend formatting/build/source hygiene checks; expect success.
- [ ] Commit implementation and tests.

### Task 2: Review and release

**Files:** The whole branch and verification artifacts under work/.

**Interfaces:** Consumes Task 1 commit and existing CI/CD workflows; produces reviewed PR and deployed release.

- [ ] Run existing full CI against the isolated test database; expect backend and browser suites pass.
- [ ] Request one fresh whole-branch review using requesting-code-review. Fix important findings with a failing regression first, then rerun affected/full verification as warranted.
- [ ] Merge and deploy through existing workflows under the user's ongoing authorization; expect successful exact-release verification.
- [ ] Inspect live department tab and modal without assigning any real account; capture proof and explain where to click.
