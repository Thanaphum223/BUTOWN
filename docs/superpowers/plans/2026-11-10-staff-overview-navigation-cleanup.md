# Staff overview and navigation cleanup

**User request:** Fix desktop navigation in place; remove the signed-in Gov/RBAC banner and linked residences; make Overview a summary distinct from the working queue.

**Implementation:** Reuse React, existing role-scoped complaint/catalog APIs and automatic reads. Overview shows the actionable total, own history total, up to five recent actionable cases, and shortcuts to the role's existing queue groups. Queue keeps search, filters, pagination and operations. Preserve the approver's existing municipality summary and recipient-only detail permissions. No backend or API changes.

**Navigation:** Desktop sidebar stays fixed with zero container scrolling; only its menu can overflow on very short windows so navigation remains reachable. Mobile retains the existing drawer. Reset the queue filter on main queue navigation or role/account/department changes. Shortcuts enter the selected queue and return the page to the top.

**Identity display:** Keep profile name/email/sync. The latest user instruction supersedes the earlier request to retain the signed-in identity banner. Login authentication and backend profile contracts remain in place.

**CI prerequisite:** Prior release verification stopped at location-popup confirmation. Trace shows a click in the modal's `ant-zoom-appear-start` to `active` transition, before the confirmation handler received it. The shared test helper now waits for existing opacity/transform settling, clicks once, and verifies the dialog closes. No product GPS changes.

## Checks
- [x] RED: overview separation was absent; residence test found the old heading.
- [x] Implement overview, shortcuts, fixed navigation, banner and residence removal.
- [x] Independent read-only review; address shortcut reset and English accessible-name findings.
- [x] Verify responsive layouts, role navigation, English labels, profile identity and dialog motion; TypeScript, formatting, source hygiene.
- [ ] Attach PR, run full main verification, deploy verified release and inspect live assets/health.

## Evidence
- 106 affected browser checks passed together (all workspace layouts, field-card metadata, clean interface, route-planning retirement, dialog accessibility, Gov SSO, language drafts and green theme).
- Shortcut reset, role/department changes, English accessible names and fixed sidebar are covered in the 26 workspace scenarios.
- TypeScript, full frontend format check, source hygiene and whitespace checks pass. Independent review reported no remaining material findings.
- Account/role filter resets use explicit successful session-transition handlers; an unconditional effect was rejected after the lazy-loading trace showed effect replay clearing a valid shortcut.
