-- Keep department rows, names and foreign keys available to historical records.
ALTER TABLE department ADD COLUMN deleted_at timestamptz;
