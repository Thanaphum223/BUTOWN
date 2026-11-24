-- Consumables are used up on the job; equipment must come back to the store.
ALTER TABLE stock_item
  ADD COLUMN item_type varchar(20) NOT NULL DEFAULT 'CONSUMABLE'
  CHECK (item_type IN ('CONSUMABLE', 'EQUIPMENT'));

-- Procurement regulation 2560, clause 205: approved quantities are held until the job starts.
CREATE TABLE stock_reservation(
  id uuid PRIMARY KEY,
  resource_id uuid NOT NULL REFERENCES resource_request(id),
  stock_item_id uuid NOT NULL REFERENCES stock_item(id),
  municipality_id uuid NOT NULL REFERENCES municipality(id),
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FULFILLED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX stock_reservation_active ON stock_reservation(stock_item_id) WHERE status = 'ACTIVE';
CREATE INDEX stock_reservation_resource ON stock_reservation(resource_id);

-- Retrospective confirmation lives beside stock_movement, which stays append-only.
CREATE TABLE stock_issue_verification(
  movement_id uuid NOT NULL REFERENCES stock_movement(id),
  verifier_role varchar(20) NOT NULL CHECK (verifier_role IN ('LEADER','KEEPER')),
  verified_by uuid NOT NULL REFERENCES app_user(id),
  note text NOT NULL DEFAULT '',
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (movement_id, verifier_role)
);

-- Overdue and progress-due reminders are tracked separately.
ALTER TABLE sla_reminder ADD COLUMN reminder_type varchar(20) NOT NULL DEFAULT 'RESOLUTION'
  CHECK (reminder_type IN ('RESOLUTION','PROGRESS'));
ALTER TABLE sla_reminder DROP CONSTRAINT sla_reminder_pkey;
ALTER TABLE sla_reminder ADD PRIMARY KEY (complaint_id, user_id, reminder_type);

-- Private conversation between the reporter and the staff handling the report.
CREATE TABLE complaint_message(
  id uuid PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES complaint(id),
  municipality_id uuid NOT NULL REFERENCES municipality(id),
  sender_id uuid NOT NULL REFERENCES app_user(id),
  sender_role varchar(20) NOT NULL CHECK (sender_role IN ('CITIZEN','OFFICER','LEADER','FIELD','APPROVER','ADMIN')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_message_case ON complaint_message(complaint_id, created_at, id);
