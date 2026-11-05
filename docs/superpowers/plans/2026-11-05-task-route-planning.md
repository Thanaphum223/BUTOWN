# Task Route Planning Implementation Plan

> Required execution skill: executing-plans; use TDD and a fresh whole-branch review after both plans.

**Goal:** Group nearby cases, calculate a road route, propose a round and let its leader confirm a field team atomically.
**Spec:** docs/superpowers/specs/2026-11-05-task-route-planning-design.md
**Architecture:** Spring/Postgres route plans/stops with complaint-version snapshots; bounded directed optimizer and configurable OSRM client; Leaflet polygon/list UI integrated in the green staff shell.

## Global constraints

OFFICER proposes / LEADER confirms. Same municipality, department, leader, unassigned TRIAGED jobs. Preserve individual workflows and original deadlines. FOSSGIS test use, coordinates only, explicit calculation, shared <=1 request/second, bounded cache, attribution. No live traffic claims or synthetic road results.

### Task 1: Routing engine and provider
- [x] RED unit tests: exact ordering on directed matrices, open/return modes, unreachable routes, 2–10 jobs; HTTP client request privacy/rate/cache/error behavior.
- [x] Implement bounded optimizer and configured OSRM gateway; GREEN tests.

### Task 2: Atomic route proposals and dispatch
- [x] RED integration tests: eligible cases, create/propose/reject/cancel, leader-only team confirmation, FIELD read, stale and cross-scope attempts, atomic collision handling.
- [x] Add route_plan/route_stop schema, controller/service and action audit, using existing Workflow ASSIGN within one transaction.
- [x] GREEN targeted and existing workflow suites.

### Task 3: Map planning and ordered field rounds
- [x] RED browser tests: polygon and list selection, start/end mode, calculate/propose, leader confirm and field progress; clear provider failure/stale feedback.
- [x] Implement green responsive page, role menu, accessible selection and persisted start/end preference.
- [x] GREEN browser/frontend checks; provider smoke test coordinates-only.

### Task 4: Combined review and release
- [ ] Full sequential backend/browser suites with the municipal corrections plan.
- [ ] Fresh review, fixes, CI/release, read-only live checks, disposable resource cleanup.
