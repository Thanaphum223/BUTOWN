-- The retention period runs from the day a complaint is closed, rejected or terminated.
ALTER TABLE complaint ADD COLUMN closed_at timestamptz;
UPDATE complaint c SET closed_at = COALESCE(
  (SELECT max(e.created_at) FROM audit_event e
   WHERE e.complaint_id = c.id AND e.to_status IN ('CLOSED','REJECTED','TERMINATED')),
  c.updated_at)
WHERE c.status IN ('CLOSED','REJECTED','TERMINATED');
CREATE INDEX complaint_closed_at ON complaint(closed_at) WHERE closed_at IS NOT NULL;

-- Retention purges are recorded with no actor.
ALTER TABLE audit_event ALTER COLUMN actor_id DROP NOT NULL;

-- Audit events stay append-only. Only a purge transaction (SET LOCAL towntrack.purge='on')
-- may delete the events of the complaint it removes.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('towntrack.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit events are append-only';
END $$;

-- The stock ledger is never deleted. A purge may only unlink a movement from the removed
-- complaint, its request and its work order; every other column must stay as it was.
CREATE OR REPLACE FUNCTION reject_stock_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('towntrack.purge', true) = 'on'
     AND NEW.complaint_id IS NULL AND NEW.resource_id IS NULL AND NEW.work_order_id IS NULL
     AND to_jsonb(NEW) - 'complaint_id' - 'resource_id' - 'work_order_id'
       = to_jsonb(OLD) - 'complaint_id' - 'resource_id' - 'work_order_id' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Stock movements are append-only';
END $$;
