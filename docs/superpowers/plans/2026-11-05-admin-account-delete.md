# Admin Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators delete local accounts safely from บัญชีผู้ใช้.

**Architecture:** Archive accounts in the existing database while retaining foreign keys and Gov identity bindings. One scoped, transactional DELETE endpoint revokes sessions and audits the action. A focused confirmation component uses it from the account table.

**Tech Stack:** Spring Boot, PostgreSQL/PostGIS, Flyway, React, Ant Design, JUnit/MockMvc, Playwright.

**Spec:** docs/superpowers/specs/2026-11-05-admin-account-delete-design.md

## Global Constraints
- Delete only local TownTrack access; keep Gov account and historical records.
- Self-delete, cross-municipality writes and non-administrator writes are forbidden.
- No real account deletions for testing. Keep shared green styling.
- Existing single-role and head/approver configuration continues working.

## Review Focus
- Gov sign-in after deletion creates a fresh local account without restoring old permissions or personal data; suspension alone stays blocked.
- Pending/history records must survive; deletion must not silently reassign work.
- Concurrent administrator deletions must retain an active administrator.
- Repeat/delete retry must not duplicate audit or accidentally reactivate an account.
- Mobile confirmation, cancel, network error and rapid clicks must remain safe.

### Task 1: Archive endpoint and access boundaries

**Files:** Modify backend/src/main/java/th/go/towntrack/AdminController.java; create backend/src/main/resources/db/migration/V21__archived_accounts.sql; extend backend/src/test/java/th/go/towntrack/TownTrackIntegrationTest.java.

**Interfaces:** DELETE /api/admin/users/{id} returns 204. /api/admin gains currentUserId and excludes archived users. Deleted accounts cannot be enabled or reassigned. GovIdentityService replaces a deleted binding with a new UUID on verified sign-in while retaining historical foreign keys.

- [ ] Add integration tests for retained complaint/evidence/identity/password, revoked sessions, hidden account, fresh Gov identity and blocked archived account edits, idempotent retry, self/CSRF/role/municipality boundaries, and deleting another administrator while keeping the actor active.
- [ ] Run targeted tests against a disposable isolated database; expect missing DELETE route failure.
- [ ] Add migration and implement scoped transactional archive with municipal lock, actor recheck, self guard, audit and revocation.
- [ ] Run targeted tests and full backend suite; expect success. Commit.

### Task 2: Account deletion UI and release

**Files:** Modify frontend/src/Admin.tsx; create frontend/src/AccountDeletion.tsx and frontend/tests/account-deletion.spec.ts; align department test fixture with currentUserId response.

**Interfaces:** Confirmation consumes target account and onDeleted:()=>Promise<void>; calls the Task 1 DELETE endpoint exactly once and refreshes the account table.

- [ ] Add failing browser tests for confirmation/cancel, self button disabled, deleted row removed with unrelated rows intact, retry/double-click, and 440/1280 viewport fit.
- [ ] Run tests and observe the missing deletion control failure.
- [ ] Implement explicit target confirmation, cancel focus, guarded deletion and recoverable inline error. Add danger button to account table.
- [ ] Run full backend/browser verification, build/format/hygiene checks. Obtain one fresh review; fix important issues with a failing regression first.
- [ ] Merge/deploy through the existing workflow. Verify the live modal without deleting real accounts; clean up only the disposable test database and local services created for this work.

### Task 4: Rejoin with a fresh identity (user correction)

**Files:** GovIdentityService.java; TownTrackIntegrationTest.java; GovCenterSsoIntegrationTest.java; AccountDeletion.tsx.
**Interface:** Verified sync of a deleted binding returns a new UUID; subsequent sync returns that same new UUID. Archive and all work references stay on the old UUID.
- [ ] Change the deletion regression to require a new identity, no old complaint ownership/follows/votes/notifications/private evidence, no former staff permissions, and stable repeat sign-in. Run RED.
- [ ] Lock the bound app_user while checking deleted_at, create a new account only for a deleted binding, and update the profile's local_user_id on conflict. Change the confirmation to explain fresh rejoin.
- [ ] Verify disabled-not-deleted still fails, all existing roles/departments survive repeat login, and concurrent rejoins create only one account. Run focused and full suites, then existing CI/deploy/live checks.

### Task 5: Configurable verified Gov initial roles
**Files:** Create V23__gov_initial_roles.sql, GovRoleMapping.java, GovRoleMappingIntegrationTest.java, GovRoleSettings.tsx, gov-role-mapping.spec.ts; modify GovIdentityService.java and Admin.tsx.
**Interfaces:** GET/POST /api/admin/gov-roles {municipalityId,serviceId,mappings:[{govRole,role,departmentId}]}; resolver initial(UUID town,JsonNode user) returns role+department for new identities only.
- [ ] Add integration RED tests for each of six mapped roles, mutable aliases, unknown/malformed/conflicting roles, inactive/wrong service/wrong municipality sources, required field department, existing local override, deletion/rejoin and configuration permissions/CSRF/foreign departments.
- [ ] Implement scoped resolver, defaults and transactional admin configuration with audited changes. Use it only when creating a fresh local account; existing credentials/roles/departments remain untouched.
- [ ] Add browser RED test to edit a mapping, select required department, cancel and save/retry on phone/desktop. Implement a separate green settings component under the user administration tab.
- [ ] Run targeted tests then complete backend/browser suites, review changed identity boundary, publish through CI and verify live configuration without changing real roles/accounts.
