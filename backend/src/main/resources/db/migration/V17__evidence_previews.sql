ALTER TABLE attachment ADD COLUMN public_copy_of uuid REFERENCES attachment(id);
ALTER TABLE attachment ADD COLUMN thumbnail_key varchar(100);
CREATE INDEX attachment_public_preview ON attachment(complaint_id,public_approved,created_at);
ALTER TABLE attachment ADD COLUMN thumbnail_size bigint;
