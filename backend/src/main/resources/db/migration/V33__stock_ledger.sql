-- Municipal stock register (Ministry of Finance procurement regulation 2560, clauses 203-213):
-- balances never go negative and every receipt, issue, return or adjustment stays on record.
CREATE TABLE stock_item(
  id uuid PRIMARY KEY,
  municipality_id uuid NOT NULL REFERENCES municipality,
  name varchar(200) NOT NULL,
  unit varchar(50) NOT NULL,
  on_hand numeric(14,2) NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipality_id, name, unit)
);
CREATE TABLE stock_movement(
  id uuid PRIMARY KEY,
  stock_item_id uuid NOT NULL REFERENCES stock_item,
  municipality_id uuid NOT NULL REFERENCES municipality,
  kind varchar(20) NOT NULL CHECK(kind IN ('RECEIVE','ISSUE','RETURN','ADJUST')),
  delta numeric(14,2) NOT NULL CHECK(delta <> 0),
  balance_after numeric(14,2) NOT NULL CHECK(balance_after >= 0),
  complaint_id uuid REFERENCES complaint,
  resource_id uuid REFERENCES resource_request,
  work_order_id uuid REFERENCES work_order,
  actor_id uuid NOT NULL REFERENCES app_user,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movement_item ON stock_movement(stock_item_id, created_at);
CREATE INDEX stock_movement_work ON stock_movement(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE FUNCTION reject_stock_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Stock movements are append-only'; END $$;
CREATE TRIGGER stock_movement_append_only BEFORE UPDATE OR DELETE ON stock_movement FOR EACH ROW EXECUTE FUNCTION reject_stock_mutation();
-- Clause 205: the stock keeper who issues items. Administrators may always manage stock.
ALTER TABLE app_user ADD COLUMN stock_keeper boolean NOT NULL DEFAULT false;
