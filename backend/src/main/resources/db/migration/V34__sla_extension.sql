-- A leader asks for more time with a reason; an officer decides. Calendar days, as decided.
CREATE TABLE sla_extension(
  id uuid PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES complaint,
  requested_by uuid NOT NULL REFERENCES app_user,
  reason text NOT NULL,
  days integer NOT NULL CHECK(days BETWEEN 1 AND 90),
  previous_due_at timestamptz NOT NULL,
  requested_due_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  decided_by uuid REFERENCES app_user,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sla_extension_one_pending ON sla_extension(complaint_id) WHERE status='PENDING';
