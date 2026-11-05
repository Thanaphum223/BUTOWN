# Department heads in department administration

The user wants to add heads directly from the existing หน่วยงาน tab. Their preceding question concerns the resource-approval selector, so the department table must expose both existing roles without conflating them: LEADER (หัวหน้าทีมลงพื้นที่) and APPROVER (ผู้อนุมัติ).

Add two current-person columns and two contextual actions per department: เพิ่มหัวหน้า and เพิ่มผู้อนุมัติ. Each action opens a searchable existing-account picker with the department and destination role fixed and visible. List only enabled accounts, exclude administrators and people already holding the destination role in that department. Explain the selected account's present role/department and that saving replaces its single primary role; it does not add an independent second role. A person must first have signed into TownTrack through Gov to appear.

Reuse POST /admin/users/{id}/role with {role, departmentId}; the existing server enforces administrator and municipality boundaries, audits the change, and revokes the target's sessions. No schema, workflow, Gov API, authentication, or real-account changes during testing. Refresh configuration after saving and show the new roster; keep a failed form open with a useful error. Prevent duplicate submissions and preserve accessible labels and green styling at mobile/desktop widths.

Approaches: moving the general role form into the tab would leave users guessing the role and department; creating a parallel department-membership model would conflict with existing workflow authorization. Contextual actions using the existing role API are the implementation choice. Existing user administration remains available for other roles and corrections.

The user has persistently requested autonomous implementation and no approval pauses; this design records the chosen implementation without another approval round.
