ALTER TABLE attachment ADD COLUMN resource_revision_id uuid REFERENCES resource_revision(id);
CREATE INDEX attachment_resource_revision ON attachment(resource_revision_id);
UPDATE attachment a SET resource_revision_id=(
  SELECT v.id FROM resource_revision v
  WHERE v.resource_id=a.resource_id AND v.created_at>=a.created_at
  ORDER BY v.created_at,v.revision LIMIT 1
) WHERE a.resource_id IS NOT NULL;
