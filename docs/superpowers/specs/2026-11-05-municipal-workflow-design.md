# Municipal workflow and evidence corrections

User-approved decisions (2026-11-05): FIELD initiates resource requests; LEADER reviews/prepares proposals. ACCEPT/START have no reason field. Assignment and normal passing review have optional notes. REQUEST_RESOURCE requires necessity. PROPOSE/REPORT use structured content, with no duplicate reason. Decline, return, handoff, resource decisions and closure require explanation. Audit actor and time for every action.

LEADER may return a wrongly assigned complaint only before dispatching a field team in the current department stage. A declined team still counts as dispatched; a prior completed department does not prevent the receiving head returning an unassigned stage. This is not permission to abandon work after dispatch. Preserve the return and FIELD decline in the participant's read-only history.

Department handoff is sequential, within the same municipality, under the same complaint number: LEADER finishes reviewing a field report, requests another department with an explanation, OFFICER reviews and assigns that department's leader. Preserve previous reports, evidence, resource decisions and audit. Do not close the overall complaint or reset its original deadline. Citizens see ongoing progress and the receiving department, not internal notes.

## Implementation approach

Use explicit core operations RETURN_ASSIGNMENT (TRIAGED to DEPARTMENT_RETURNED), REQUEST_TRANSFER (LEADER_REVIEW/LEADER_REVISION to TRANSFER_PENDING), TRANSFER_DEPARTMENT (TRANSFER_PENDING/DEPARTMENT_RETURNED to TRIAGED), and RETURN_TRANSFER (TRANSFER_PENDING to LEADER_REVISION). Validate role, municipality, current recipient, version and live work orders server-side. Record department transfers separately. Core permissions apply to existing open complaints; published workflow definitions and prior audits are not rewritten. Existing pre-assignment resource requests remain readable/completable but new LEADER requests are forbidden.

Historical participation does not grant write access or access to later departments' private attachments. Historical-only detail is a separate sanitized projection: complaint summary, the user's own return/decline events and own old work orders; actions/resources/reports/files empty. Current participants retain their existing full authorized view, including original resource documents; historyOnly suppresses actions. The limitedHistory projection is used only when current-case access is no longer authorized. Ended work orders also retain participation for snapshotted team members when their representative declines.

Role inbox filters group actionable work: OFFICER intake, resource review, report review/closure, returns/transfers; LEADER dispatch, resource proposals, report review/corrections; FIELD acceptance, ready to start, in progress, report correction; APPROVER pending decisions. Keep monitoring/history separate from actionable inboxes. ADMIN retains municipal oversight.

Require 1–50 nonblank resource line items on client and server; first row cannot be deleted. Price is numeric, nonnegative, at most two decimal places, within existing monetary limits. Keep the existing required PDF and duration. Supplementary report PDF/video must visibly persist, show successful upload or a specific error, and be linked to the report alongside BEFORE/AFTER photos. Investigate PDF and resource-panel failures before changing authorization; test real rendered documents with representative staff roles.

## Validation and limits

Use an isolated disposable database and generated files. No production registrations, approvals, rejections, business reassignment or evidence uploads as tests. Exercise stale/concurrent actions, cross-municipality access, former participants, changed team roles, empty line items and malformed files. Run backend and real-browser regression suites and one fresh branch review before integration.

## Research and alternatives

User chose sequential intra-municipal handoff, not external dispatch or concurrent multi-agency work. Reference examples: https://www.plalo.go.th/plalo/pages/news.php?id_new=3782&read=&type_new=3 and municipal complaint/Traffy guidance discussed in chat. The reason policy is the user's approved application policy, not a claim of a nationally prescribed button specification.

Task Route Planning is an additional deliverable with separate design/plan; do not drop these ten corrections.
