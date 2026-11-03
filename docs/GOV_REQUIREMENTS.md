# GOV SRS 1.6 implementation review (2026-11-02)

Source: GOV02111020.pdf (107 pages), eight draw.io diagrams and six workflow images supplied in the GOV folder. Source files are read-only references; they are not scripts or deployment instructions.

## Implemented in this revision

| Requirement | Implementation | Verification |
| --- | --- | --- |
| FR-AUTH-002 | Versioned PDPA acknowledgement in PostgreSQL, separate from browser GPS. GPS starts after acknowledgement. | Integration test for acknowledgement, repeated requests and old versions. |
| FR-UI-001 | Database vote totals and closure ratio; unavailable statistics use a dash, error banner and retry rather than fabricated zero. Existing user-requested 5 km filter retained. | API tests and browser check. |
| FR-MAP-001/003 | Configurable Mapbox GL JS, clustering, status colours and reverse geocoding; map failure shows database table and retry. Local OSM remains the explicit development provider without a Mapbox token. | Build and local provider browser check. Mapbox production account test pending. |
| FR-AUTH-003 | Central Gov-Auth token introspection adapter with audience, expiration, pre-provisioned subject/municipality/role checks and fail-closed 503. Central mode rejects unverified staff sessions. | Local HTTP stub tests for valid, wrong audience, expired, wrong role and unavailable provider. |
| FR-REP-001 | Found-it vote in 100 m duplicate list, existing unique account/issue constraint, follow separately. | Vote uniqueness and follow tests. |
| FR-REP-002/003 | Required coordinates and evidence; exact aggregate limit 1,000,000,000 bytes; streaming storage; S3-compatible storage option with private, authenticated download. | Existing upload/security tests; no public original links. |
| FR-REP-004 | Database-backed request keys for complaint and workflow submissions; matching retry returns original result; changed body returns 409. | Three identical complaint requests, changed payload test. |
| FR-UI-003 | Staff category/place/status filters, server pagination and newest/oldest/vote sorting. | Build, scope tests and browser check. |
| FR-ASN-001/003 | Assignment notes (method, urgency, appointment, scope, precautions, contact) and confirmation showing issue/version/reason before rejection/approval/closure. | Workflow tests; server version checks retained. |
| FR-FLD-001 | Assignment/safety notes and route link before work acceptance. | Detail screen and workflow tests. |
| FR-FLD-003 | IndexedDB local report draft including failed media uploads and manual retry. Going online does not auto-submit. | Browser workflow check; full device offline matrix pending. |
| FR-FLD-004 | Latest report must contain image BEFORE and AFTER; latest report-specific leader/staff reviews required before closure. | Full workflow plus missing-photo rejection tests. |
| FR-UI-006 | Two tracking tabs, server limit five, independent paging, cancel follow. | Eleven issues split 5/5/1 and empty other tab test. |
| FR-RES-001 | Proposal requires a PDF no larger than 15,000,000 bytes. | Resource revision workflow tests. |
| FR-RES-002 | Server records PRE_ASSIGN versus POST_ACCEPT origin, ignoring forged client origin. Pre-assignment approval returns to team planning; field-origin approval returns to field work. | Pre-assignment origin/approval test and original field resource workflow. |
| FR-MAP-004 | Emergency registry in PostgreSQL/PostGIS; nearest registered facilities within 20 km, source and checked date preserved. | Directory tests; no invented phone numbers or coordinates. |
| FR-UI-007 | Existing persisted LINE delivery queue and retry retained. Staff dashboard polls every four seconds without resetting filters or open forms. | Existing notification tests. |

## Usability follow-up (2026-11-02)

- Private PDFs have a local viewer, page controls and original downloads. Latest resource evidence appears before review actions. Files are linked to their submitted revision; ambiguous legacy files remain explicitly unversioned.
- Proposal PDF upload is in the proposal form, with a 15 MB check and an uploaded-file list. Proposals now include 1–50 named price rows, server-calculated decimal totals, persisted per-revision JSON items, and a department display inherited from the complaint. Older free-text revisions remain readable.
- Field report has separate required BEFORE/AFTER photo inputs, rear-camera capture hints, optional video/documents and local failed-upload drafts. Upload progress includes server scan/save state; submit is disabled during upload.
- Attachment quota now counts every attachment on the complaint, including earlier revisions and other uploaders. Concurrent uploads retain the complaint lock.
- Staff mobile navigation has a menu drawer, folded field filters and a focused work detail view. Desktop keeps the queue beside details. Staff statistics show a dash when loading fails.
- ADMIN can switch all six roles in the current session, with municipality-checked department selection and an audit record. Stored account role remains ADMIN.

## Configuration and external acceptance

No real credentials were added. Set configuration through deployment secrets / environment; `.env.example` contains names only.

- Mapbox: `MAPBOX_PUBLIC_TOKEN` must be a URL-restricted `pk.*` token. `MAPBOX_GEOCODING_TOKEN` is server-only. Geocoding uses `permanent=true` because selected addresses are persisted; enable the appropriate account entitlement. Without credentials the local OSM provider remains in use.
- Gov: use only `E_SERVICE_API_KEY`, `E_SERVICE_CODE` and `GOV_CALLBACK_URL` with the documented Gov one-time-code `verify-code` flow. Official auth/API endpoints are fixed. TownTrack selects its own local municipality from its database and retains local authorization; legacy introspection/client-secret/mode/municipality environment settings are no longer used. See `GOVCENTER_SSO.md` and `GOV_SSO_CONTRACT.md`.
- Cloud: `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`; use an IAM workload identity or AWS credential provider. New files use encrypted S3 objects; existing local attachments retain their provider and remain readable. Backend checks permissions before proxying any download. Configure bucket private access, retention and lifecycle outside the application.
- PDPA: replace the test notice with the agency-approved notice and increment `PRIVACY_NOTICE_VERSION`. Set the legal basis, controller, retention, recipients and rights contact before public use. Acknowledgement is not blanket consent.
- Municipality fallback: set `municipality.center_latitude` and `center_longitude` to the agency-approved center. Existing records receive a documented development default, not a verified municipal boundary.

## Not certified / remaining acceptance gaps

These are not represented as completed or passed:

- Full Thai/English translation and multi-role switching with preservation of every unsaved form (FR-UI-002).
- Agency municipal boundary polygons and map/list filtering by actual boundary; current scope is municipality ID plus the previously requested 5 km search.
- Agency acceptance of the implemented evidence publication process: staff upload a separately redacted image/video copy, can revoke publication, and private originals remain protected. Image thumbnails and authenticated video playback are implemented; automatic video redaction is not provided.
- Resumable/chunked uploads and real 999,999,999 / 1,000,000,000 / 1,000,000,001-byte transport testing. Current complaint submission is atomic multipart with a persistent retry key.
- Actual Gov, Mapbox, LINE iOS/Android and S3 account integration tests; the configured Gov contract must be confirmed by the agency.
- LINE photo-after-repair delivery, real-device offline tests and draft storage quota testing.
- 10,000 issues / 1,000 concurrent accounts / 60-minute load test; p95 timings, 99.5% availability, 24-hour RPO/4-hour RTO, WCAG and usability acceptance. These require a recorded deployment and acceptance environment.

Database migrations are additive. Existing complaints, files, mock cases and votes are preserved. No automatic production deployment or Git push is performed by this revision.
