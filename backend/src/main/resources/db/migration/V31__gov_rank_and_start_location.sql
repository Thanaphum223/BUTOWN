-- Gov Center role code (rank) seen at the user's latest Gov sign-in, used to group field workers.
ALTER TABLE app_user ADD COLUMN gov_role varchar(100);

-- Where the field worker stood when starting work, and how far that is from the reported point.
ALTER TABLE work_order ADD COLUMN start_latitude numeric(9,6);
ALTER TABLE work_order ADD COLUMN start_longitude numeric(9,6);
ALTER TABLE work_order ADD COLUMN start_accuracy_m numeric(10,1);
ALTER TABLE work_order ADD COLUMN start_distance_m numeric(12,1);
