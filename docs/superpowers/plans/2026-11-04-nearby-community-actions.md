# Nearby Community Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nearby complaint voting, following and icons behave like the citizen home page.

**Architecture:** Reuse one action-button component on both screens. Add only vote totals, reader vote/follow state and mock metadata to the existing sanitized nearby API. Nearby mutations refresh the same query without changing the report draft; preserve the existing strict 100-metre/category follow endpoint. Pass the category name to the existing map symbol renderer.

**Tech Stack:** React, Ant Design, Leaflet, Spring MVC/PostGIS, Playwright.

**Spec:** User's two screenshots and request in this chat on2026-11-04: same voting feel as home and restore missing icons. User has delegated implementation choices and authorized deployment. Nearby scope stays100 metres; records, mock data, SSO and ENV are untouched.

## Global Constraints

- Existing municipal/role checks, privacy projection, closed-case exclusions and100-metre filter remain.
- Use existing Eye/Bell/Check/Like icons and category map symbols; no new dependencies.
- No success-toast stacking. Busy controls reject repeated submissions; show a failed action without changing saved state.
- No changes to Cloud votes/follows/cases for verification; use isolated fixtures for mutations and read-only Cloud checks.

## Review Focus

- Rapid/repeated vote clicks send one request while pending; cancellation decrements once.
- Failure preserves current state, clears busy controls and supports retry.
- Point/category changes while a mutation or read is pending cannot replace the new area's results.
-320px/440px displays long category labels, action icons and bottom menu without overflow.
- Another citizen/municipality cannot receive a reporter identity, exact location, private description or attachments from nearby.

### Task 1: Shared nearby interactions

**Files:** Create `frontend/src/CommunityActions.tsx`; modify `CitizenHome.tsx`, `NewCase.tsx`, `style.css`, `ComplaintController.java`; tests `frontend/tests/nearby-actions.spec.ts` and `TownTrackIntegrationTest.java`.

**Interfaces:** `/api/nearby` remains an array with existing fields and adds `votes`, `voted`, `following`, `mock`, `created_at`. Shared `CommunityActions` consumes one item and detail/vote/follow callbacks plus disabled/loading flags. Home retains its existing API mutations and refresh behavior; reporting retains its location/category authorization checks.

- [ ] Add browser regressions for count/toggle/follow/error/rapid-click behavior, category map icons and responsive menu. Run against baseline and observe missing controls/icons.
- [ ] Add backend integration assertions for initial and changed vote/follow reader state, sanitization and tenant/radius/category constraints.
- [ ] Implement the minimal shared UI and nearby API projection; keep failed or stale requests from corrupting current results.
- [ ] Run focused browser regressions, formatting/build/source checks; commit, request one fresh whole-branch review and fix important findings.
- [ ] Require full main CI before deployment. Verify live counts/icons/preview controls without submitting a vote/follow and preserve preexisting database rows/files.
