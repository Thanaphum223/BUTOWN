# Clean Language Controls, Remove UAT and Add Approver Overview

Date: 2026-11-07
Baseline: 5c0104c6fed79d56ff3635ba7ab4ef1e99fab090

## Intent and approved scope

The user requests fewer language selectors, complete removal of UAT simulation, and an approver overview covering the municipality. They explicitly confirmed: show totals and status listings for every municipal case; details, documents and decisions remain limited to cases addressed to that approver.

## Design

- Keep language selectors only on the main authenticated header and standalone authentication, callback and privacy-gate pages. Remove selectors inside dialogs, drawers, document previews and confirmation overlays. Retain bilingual catalogs, persisted language and ordinary form behavior.
- Remove the UAT toolbar, simulation store/request interception, in-dialog UAT entry, flag/environment wiring, enabled-only test server/project and simulation-only translations/styles/tests. Preserve genuine Gov/CSRF 503 handling, original provider details, CSRF, authentication, request/upload behavior and submission safeguards. The real Gov identity badge is not a UAT simulation and stays.
- Add an optional overview=true query to existing GET /api/complaints, accepted only for effective APPROVER role. It returns the existing minimal list projection and totals for the same municipality across all statuses. Default personal approval queue and history behavior stay unchanged. Reject overview with historyOnly or queue; accept existing search/category/area/sort and activeOnly/completedOnly filters.
- Render a dedicated approver overview on the existing dashboard view. Show four existing global stats and a responsive read-only status list. Filters offer all/active/completed, search and normal pagination. A clear button opens the existing personal approval queue. No details/documents/approval actions or detail prefetch in the overview.
- Keep Access.complaint, file permissions and workflow decision recipient checks unchanged. No new table, migration, role key, workflow transition or API path.

## Approaches considered

Changing the global APPROVER access scope would broaden details/files and is contrary to the user's explicit answer. A frontend-only aggregate of the personal queue cannot provide true municipal totals. A restricted summary-list mode on the existing endpoint supplies real data while preserving the established detail and mutation boundaries.

## Constraints and validation

Use the existing React/TypeScript/Ant Design/Spring stack. Support Thai/English at 390/768/1280. Preserve typed source data, email locking, existing Gov integration, attachments, maps and citizen privacy. Never test business mutations in the live database; use mocked browser APIs and isolated backend/CI fixtures.

The precise request and the answered data-scope clarification authorize implementation and the established PR/release workflow; proceed without another design/implementation approval menu.
