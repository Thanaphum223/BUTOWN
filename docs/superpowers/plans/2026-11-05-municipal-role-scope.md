# Municipal role scope and complete journey verification

1. Reproduce municipal reviewer failures with department-free OFFICER/APPROVER fixtures, picker and role-switch regressions.
2. Normalize accounts and fix validation, role switching, access and case-specific field pickers; replace department approver controls with field staff. Verify targeted tests.
3. Add browser regressions for municipal roles without department prompts and a complete approved-resource journey through all roles to CLOSED. Run on isolated PostgreSQL, retain screenshots and audit evidence. Fix observed failures.
4. Run formatting, hygiene, full backend/browser suites and one fresh read-only review. Resolve findings before merging.
5. Push/attach PR, pass CI, merge and deploy exact main SHA. Verify live UI without deleting users or advancing real work. Clean up only task-created test database/role/tunnel. Report evidence and practical limitations.
