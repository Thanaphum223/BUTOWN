ALTER TABLE work_order ADD COLUMN handed_off boolean NOT NULL DEFAULT false;
ALTER TABLE resource_request ADD COLUMN handed_off boolean NOT NULL DEFAULT false;
CREATE TABLE department_transfer(
  id uuid PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES complaint,
  municipality_id uuid NOT NULL REFERENCES municipality,
  source_department_id uuid NOT NULL,
  target_department_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES app_user,
  report_id uuid REFERENCES field_report,
  reason text NOT NULL,
  state varchar(20) NOT NULL CHECK(state IN ('PENDING','ACCEPTED','RETURNED')),
  reviewed_by uuid REFERENCES app_user,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  FOREIGN KEY(source_department_id,municipality_id) REFERENCES department(id,municipality_id),
  FOREIGN KEY(target_department_id,municipality_id) REFERENCES department(id,municipality_id),
  CHECK(source_department_id<>target_department_id)
);
CREATE UNIQUE INDEX one_pending_department_transfer ON department_transfer(complaint_id) WHERE state='PENDING';
CREATE INDEX department_transfer_case ON department_transfer(complaint_id,created_at);
