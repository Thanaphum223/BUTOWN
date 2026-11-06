-- Retire route planning without deleting historical rounds or dispatched municipal work.
-- Release every reservation so complaints remain assignable through the ordinary workflow.
UPDATE route_stop SET reserved=false WHERE reserved;

UPDATE route_plan
SET status='CANCELLED', version=version+1, updated_at=clock_timestamp()
WHERE status IN ('DRAFT','PROPOSED');
