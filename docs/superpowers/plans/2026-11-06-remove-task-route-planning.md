# Remove Task Route Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Task Route Planning while keeping ordinary municipal assignment and existing work operational.

**Architecture:** Delete the dedicated route UI/controller/service/provider/optimizer. Remove route reservation policy hooks, and use a forward-only migration to release reservations and cancel unstarted rounds while retaining historical records and dispatched work.

**Tech Stack:** React, TypeScript, Playwright, Spring Boot, JDBC, PostgreSQL/PostGIS, Flyway, Maven.

**Spec:** docs/superpowers/specs/2026-11-06-remove-task-route-planning-design.md

## Global Constraints
- Preserve the ten municipal workflow fixes, ordinary teams, assignments, evidence, reports, transfers and audit history.
- Preserve applied V25; add V26 rather than rewriting applied migration history.
- Cancel only DRAFT/PROPOSED plans and release reserved stops; preserve DISPATCHED plans and their work orders.
- No live business actions, registrations, or production data deletion during QA.

## Review Focus
- A pending reservation must not hide actions or block normal assignment after feature removal.
- Jobs already dispatched in a round must remain accepted/startable through the ordinary workflow.
- No route menu or reachable screen for any of its former roles, including the mobile drawer.
- All former route endpoints must be absent rather than merely hidden from navigation.
- Applied migration history and unrelated municipal workflow fixes must remain unchanged.

### Task 1: Remove the feature and release its reservations

**Files:** frontend/src/App.tsx, Detail.tsx, style.css; dedicated RoutePlanning and RoutePlanningMap modules/tests; backend Workflow.java, WorkflowPolicy.java, ComplaintController.java, BrowserTestServer.java; dedicated RoutePlanning, RoutePlanningController, RouteOptimizer, OsrmRouting modules/tests and BrowserRoadProvider; V26 migration; deploy/cloud/.env.example; docs/task-route-planning.md; new backend/frontend retirement tests.

**Interfaces:** Standard /api/complaints, /api/teams and workflow actions remain unchanged. /api/route-plans and its subpaths are removed. Legacy route tables are historical only after migration.

- [ ] Write browser regressions checking old route menus are absent and normal queues still open for OFFICER/LEADER/FIELD/ADMIN at 390px and 1440px. Run and observe failure on the old navigation.
- [ ] Write backend regressions: former route endpoints return 404; legacy reserved complaints still expose and execute ordinary assignment; applying V26 cancels DRAFT/PROPOSED only, releases stops and preserves dispatched orders and audit history. Run and observe expected failures.
- [ ] Remove dedicated UI/backend/provider/test fixtures; remove reservation locks and detail metadata; add V26. Keep V25 unchanged.
- [ ] Update provider example and feature documentation, preserving historical design documents as archived context.
- [ ] Run new regressions to green, full Maven verify, frontend format/build and full browser suite through existing CI. Check source references and exact diff.
- [ ] Commit, obtain one fresh whole-branch review, resolve substantive issues, create/attach PR, pass CI, merge and deploy using the established flow.
- [ ] Verify release SHA, service health, migration 26, no active reservations, public built UI navigation and absent served route chunk. Clean task-owned local test services/database.

### Task 2: Citizen tracking, shared detail and final decisions

**Spec:** docs/superpowers/specs/2026-11-06-citizen-tracking-design.md

**Files:** GovAuthPage.tsx, CitizenHome.tsx, CitizenTracking.tsx, App.tsx, Detail.tsx, CommunityDetail.tsx, new CitizenOutcome.tsx, style.css, ComplaintController.java, new citizen UI/privacy regressions; update existing tracking selectors.

**Interfaces:** Detail gains a public/read-only mode loading the existing /community/complaints/{id} endpoint. CitizenTracking opens either own or public full-page detail through its parent callback. Citizen audit history projection shares the final public reason while omitting all other reasons and actor fields. No added permissions or business mutations.

- [ ] Write and run failing UI regressions for removed buttons, tracking labels/layout, final workflow stage and followed full-page details/read-only uploads.
- [ ] Write and run failing MVC regressions for final decision reasons, active-case private notes, rounded community locations and unchanged ownership/municipality restrictions.
- [ ] Implement shared detail/public mode, citizen outcome banner, responsive cards and copy/button changes. Keep public endpoint sanitization and approved media.
- [ ] Run new tests to green, existing navigation/workflow/privacy regressions, format and production build, then full existing CI.
- [ ] Fresh whole-branch review after this added scope; publish reviewed combined changes through CI/deployment, verify actual served navigation/detail and retirements, clean isolated QA data/services.
