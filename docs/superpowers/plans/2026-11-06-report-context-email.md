# Report Context and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution and one final fresh review.

**Goal:** Match examples to the selected report category and prefill a locked, trustworthy Gov email contact.

**Architecture:** A category example helper and read-only profile field serve NewCase. V27 adds a private contact_email snapshot, set by ComplaintController from the authenticated user's stored Gov profile, shown only in authorized staff detail.

**Tech Stack:** React/Ant Design, Playwright, Spring MVC/JDBC, PostgreSQL, Flyway.

**Spec:** docs/superpowers/specs/2026-11-06-report-context-email-design.md

## Global Constraints
- No overwrite of citizen-entered descriptions when selecting another category.
- No email inferred from username or trusted from the request body.
- No public contact email; existing reporter/municipality authorization is unchanged.
- Missing Gov email is optional; profile failure has retry feedback.
- No live registrations or business actions in QA.

## Review Focus
- Custom category names and missing categories use relevant general guidance.
- Switching categories or returning between wizard steps preserves typed values.
- A missing email must not inherit another user's profile or block reporting.
- Staff email is a submission snapshot even after later Gov profile updates.
- Public/community/nearby responses must not expose the new contact field.

### Task 1: Integrate report examples and trusted contact email

**Files:** NewCase.tsx; new reportExamples.ts and ReporterEmail.tsx; Detail.tsx; ComplaintController.java; V27__report_contact_email.sql; new ReportContactEmailIntegrationTest.java and report-context-email.spec.ts.

**Interfaces:** Existing /auth/gov-profile supplies profile.email. NewCase sends no email property. ComplaintController derives contact_email using authenticated local_user_id + municipality_id; authorized staff detail includes it through the existing private DTO. Public DTOs stay explicit.

- [x] Write browser regressions for category switching/custom fallback, preserved description, locked email on mobile/desktop, absent email and retry after profile failure. Observe the original static placeholder/missing field fail.
- [x] Write MVC regressions for spoof-resistant email snapshots, missing/absent profiles and public privacy. Observe missing email in staff detail fail.
- [x] Implement the helper/field, V27 and server-owned snapshot; show authorized staff email with existing contact fields.
- [ ] Run targeted tests, formatting, production build and privacy/navigation regressions. Obtain a fresh whole-branch review and address substantive findings.
- [ ] Commit, create and attach PR, pass full CI, merge, deploy, verify release/migration and public built UI with mocked API responses. Clean isolated QA resources.
