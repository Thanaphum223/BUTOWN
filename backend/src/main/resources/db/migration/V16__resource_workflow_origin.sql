ALTER TABLE resource_request ALTER COLUMN work_order_id DROP NOT NULL;
ALTER TABLE resource_request ADD COLUMN workflow_origin varchar(20) NOT NULL DEFAULT 'POST_ACCEPT'
 CHECK(workflow_origin IN ('PRE_ASSIGN','POST_ACCEPT'));
INSERT INTO workflow_transition(workflow_id,from_status,action,to_status,role)
SELECT id,'TRIAGED','REQUEST_RESOURCE','RESOURCE_DRAFT','LEADER' FROM workflow_version
ON CONFLICT DO NOTHING;
