-- Photos taken when field work starts belong to the work order, not to a later report revision.
ALTER TABLE attachment ADD COLUMN work_order_id uuid REFERENCES work_order(id);
CREATE INDEX attachment_work_order ON attachment(work_order_id) WHERE work_order_id IS NOT NULL;

-- Items and quantities a field worker requests, used to prefill the leader's proposal.
ALTER TABLE resource_request ADD COLUMN requested_items jsonb NOT NULL DEFAULT '[]'::jsonb;
