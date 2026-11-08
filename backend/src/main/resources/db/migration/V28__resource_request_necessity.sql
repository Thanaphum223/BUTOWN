ALTER TABLE resource_request ADD COLUMN necessity text;

-- Both original inserts use transaction-stable now(). Recover a reason only when
-- the exact complaint, requester, and timestamp identify one request and one audit.
-- Ambiguous historical rows stay unset rather than borrowing another request's reason.
WITH matches AS (
  SELECT r.id resource_id, e.reason,
         count(*) OVER (PARTITION BY r.id) request_matches,
         count(*) OVER (PARTITION BY e.id) audit_matches
  FROM resource_request r
  JOIN audit_event e ON e.complaint_id = r.complaint_id
    AND e.actor_id = r.requested_by AND e.created_at = r.created_at
    AND e.action = 'REQUEST_RESOURCE' AND e.to_status = 'RESOURCE_DRAFT'
)
UPDATE resource_request r SET necessity = m.reason
FROM matches m
WHERE r.id = m.resource_id AND m.request_matches = 1 AND m.audit_matches = 1
  AND NULLIF(btrim(m.reason), '') IS NOT NULL;
