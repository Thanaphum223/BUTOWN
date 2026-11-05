# Municipality reviewers and department field staff

OFFICER is a municipal inspection officer; APPROVER is a municipal approver. Neither belongs to a department. LEADER and FIELD belong to departments. Preserve existing accounts, IAM bindings, complaints, work and audit history.

Normalize existing OFFICER/APPROVER department IDs to NULL. Account role assignment and admin role switching clear municipal departments; LEADER/FIELD require a valid same-municipality department. Inspection officers can read/triage/review every department within their municipality. Triage selects a leader in the case's responsible department. Field people stay department scoped. Approvers are selected across the municipality but can only act on their assigned current approval stage. The department roster manages heads and field staff; municipal roles use the account role form without a department.

The user additionally requires a complete journey audit. Run the product browser against an isolated database: citizen submission with PDF, inspection triage, leader assignment, field acceptance, resource proposal, inspection review, municipal approval, field before/after report, leader review, inspection verification and closure. Include existing revision, rejection, denial, team, idempotency, CSRF, and cross-municipality regressions. Test fixture logins remain outside production artifacts. Never register/delete real Gov users or advance real complaints to test.

Account deletion remains local archival with disabled access, session revocation, retained Gov binding and history, self-deletion protection, municipal serialization/actor recheck and confirmation UI. Work is not automatically reassigned.
