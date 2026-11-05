-- Reviewers and approvers serve the municipality; field staff retain departments.
UPDATE app_user SET department_id=NULL WHERE role IN ('OFFICER','APPROVER');
ALTER TABLE app_user ADD CONSTRAINT municipal_review_roles_have_no_department
    CHECK (role NOT IN ('OFFICER','APPROVER') OR department_id IS NULL);
