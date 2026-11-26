-- Procurement regulation 2560, clauses 208(2), 209 and 211: equipment taken off site goes out on a
-- written loan with a reason and a return date, approved by the mayor or a written delegate; it
-- comes back in working order and is chased within 7 days of falling due.

-- Approvers the mayor has delegated, in writing, to approve equipment loans.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS loan_approver boolean NOT NULL DEFAULT false;

-- Return date the field team asks for when a request includes equipment.
ALTER TABLE resource_request ADD COLUMN IF NOT EXISTS loan_due_on date;

-- Loan register. Like the stock ledger it outlives the complaint, so its links are nullable.
CREATE TABLE IF NOT EXISTS equipment_loan(
  id uuid PRIMARY KEY,
  municipality_id uuid NOT NULL REFERENCES municipality,
  stock_item_id uuid NOT NULL REFERENCES stock_item,
  complaint_id uuid REFERENCES complaint,
  resource_id uuid REFERENCES resource_request,
  work_order_id uuid REFERENCES work_order,
  borrower_id uuid NOT NULL REFERENCES app_user,
  approved_by uuid REFERENCES app_user,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  due_on date NOT NULL,
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  returned_by uuid REFERENCES app_user,
  return_condition varchar(20) CHECK (return_condition IN ('GOOD','DAMAGED','LOST','CANCELLED')),
  return_note text NOT NULL DEFAULT '',
  reminded_at timestamptz,
  CHECK ((returned_at IS NULL) = (return_condition IS NULL))
);
CREATE INDEX IF NOT EXISTS equipment_loan_open ON equipment_loan(municipality_id, due_on)
  WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS equipment_loan_work ON equipment_loan(work_order_id);
CREATE INDEX IF NOT EXISTS equipment_loan_complaint ON equipment_loan(complaint_id);
