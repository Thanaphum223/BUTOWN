ALTER TABLE app_user ADD COLUMN deleted_at timestamptz;
ALTER TABLE app_user ADD CONSTRAINT deleted_accounts_are_disabled
  CHECK (deleted_at IS NULL OR enabled = false);
