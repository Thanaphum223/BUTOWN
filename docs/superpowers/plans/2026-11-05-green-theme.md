# Green Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline implementation.

**Goal:** Give every TownTrack area consistent green branding and readable controls.
**Architecture:** Extend existing shared Gov theme and CSS. Remove page overrides that conflict with shared tokens; preserve semantic status colors.
**Tech Stack:** React, TypeScript, Ant Design, CSS, Playwright.
**Spec:** docs/superpowers/specs/2026-11-05-green-theme-design.md

## Global Constraints
- Keep #1E7D55 as brand primary; use mint/white/deep-green surfaces and readable green neutrals.
- Preserve all authentication, privileges, requests, copy and navigation behavior.
- Preserve red errors, orange warnings, meaningful progress/rank/provider colors.
- No real registrations or account/data mutations.

## Review Focus
- White header text and hover/focus text retain at least 4.5:1 contrast.
- Staff mobile drawer and citizen bottom navigation inherit the same selected green.
- Auth's compact ConfigProvider inherits central colors and retains layout.
- Blue progress markers/warnings remain distinguishable from selected map location.
- Popups and document viewers inherit readable text and surfaces without changing document content.

### Task 1: Shared palette and application chrome
**Files:** frontend/src/govTheme.ts, frontend/src/style.css, frontend/src/GovAuthPage.tsx, frontend/tests/green-theme.spec.ts.
**Interfaces:** existing govTokens CSS variables and govTheme ConfigProvider object.
- [x] Add browser checks using mocked API boundaries for green staff sidebar, shared header/link/form colors, citizen selected navigation, auth card, mobile drawer and contrast. Observe failure for navy staff sidebar and non-green neutrals.
- [x] Change shared tokens and CSS; remove auth color overrides while preserving control sizing.
- [x] Run focused theme/navigation/auth tests; expected all pass and no viewport overflow. Inspect representative mobile/desktop screenshots.

### Task 2: Finish whole-app color audit and release
**Files:** App.tsx, ResourceReview.tsx, Detail.tsx, LocationMap.tsx, MapboxLocationMap.tsx where hardcoded decorative colors conflict.
**Interfaces:** consume govTokens from Task 1 for identity and map selection; semantic status markers remain unchanged.
- [x] Replace conflicting identity/decorative colors with shared tokens. Keep destructive/status colors.
- [x] Run focused tests, formatting/build/source hygiene; expected exit 0.
- [ ] One fresh whole-branch review, then commit, PR, merge and full main CI/CD.
- [ ] Verify live release, admin grant and existing data; save representative UI proof. No live signup.
