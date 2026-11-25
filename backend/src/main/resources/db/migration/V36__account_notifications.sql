-- Account notices, such as staff waiting for a department, belong to no complaint.
ALTER TABLE notification ALTER COLUMN complaint_id DROP NOT NULL;
