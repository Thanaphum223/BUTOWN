# Staff workflow corrections implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for these scoped tasks. Preserve unrelated changes.

**Goal:** Resolve the eight user-reported staff workflow issues without broadening approver access.
**Architecture:** Keep the existing workflow and role boundaries. Remove scheduling UI, expose resource request necessity, accept scanned JPEG/PNG or PDF proposal documents, and show accessible responsive progress and evidence controls.
**Tech Stack:** React/TypeScript/Ant Design; Spring Boot/PostgreSQL; Playwright/JUnit.
**Spec:** The user's eight numbered corrections in this conversation, with confirmed own-recipient-only approver detail and JPEG/PNG/PDF proposal document policies.

## Global constraints
- OFFICER, LEADER, FIELD, APPROVER interfaces show no appointment, due date, or overdue UI. Preserve audit timestamps and internal stored historical values.
- Successful RETURN_ASSIGNMENT returns to queue; existing fix remains included.
- Approvers see every municipal summary but open details only for their routed jobs; enforce authorization on server.
- Proposal documents accept server-detected JPEG/PNG/PDF up to 15,000,000 bytes each; keep existing total quota and file authorization.
- Preserve explicit reasons, request/revision linkage, translations, file scanning, and historical records.

## Review focus
- Draft resource requests show original necessity before proposal exists.
- A spoofed extension never bypasses MIME validation; type and size errors are distinct.
- Unassigned/other-approver/handed-off jobs remain inaccessible.
- Progress and evidence controls stay visible at mobile/tablet/desktop sizes.
- Transfer text uses real configured department names rather than silently modifying business data.

### Task 1: Resource request data and document policy
- [x] Add regression tests showing draft necessity and JPEG/PNG/PDF proposal requirements; verify failures.
- [x] Persist request necessity and expose requester metadata; retain existing historical necessity only when association is unambiguous.
- [x] Render draft requests and update accepted document predicates, labels, and requirement documentation.
- [x] Run targeted backend/browser checks and review.

### Task 2: Assigned approver navigation
- [x] Add failing summary eligibility and direct-own-detail tests.
- [x] Compute can_open with existing recipient rules and expose own-job open control; wire existing App navigation.
- [x] Verify own access and denial for other/unassigned/handed-off jobs.

### Task 3: Staff scheduling UI, progress, evidence, transfer text
- [x] Add failing role and responsive regressions.
- [x] Remove scheduling/overdue fields from staff views/forms and history rendering; keep audit dates.
- [x] Show workflow progress without a disclosure; wrap full step labels on small widths.
- [x] Give supplementary video/document attachments the same visible section/control structure as before/after images.
- [x] Correct transfer text spacing and inspect configured department name if the reported character comes from data.
- [ ] Complete integrated browser/release verification and deploy the verified release.

## Validation ledger
- Backend RED observed for necessity, image proposal, mixed oversized file, and overview can_open.
- Backend verify: 194 tests passed, zero failures/errors/skips; Spotless passed.
- Browser RED observed before fixes for draft request visibility, JPEG/PNG/camera/type errors, scheduling fields, collapsed progress, and supplementary upload section.
- Browser GREEN: all 4 staff scheduling cases; 390/768/1280 progress; visible supplementary section; JPEG/PNG uploads; type/size errors; original necessity before and after a proposal; field metadata account/page/race protection.
- Existing return-assignment fix and session expiry deployed separately as release4f6ea7; its CI passed189backend +235browser.
- User confirmed no rename for the department named “ด”; only status wording/spacing changes.

- Isolated real-browser journey suite: 8/8 passed, including approved resource request through CLOSED and refusal through TERMINATED. File-picker selectors now distinguish the chooser from the new camera input.
