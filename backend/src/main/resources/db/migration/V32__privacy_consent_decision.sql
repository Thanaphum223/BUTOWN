-- Record whether the user accepted or declined the privacy notice; declining keeps GPS disabled.
ALTER TABLE privacy_acknowledgement ADD COLUMN consented boolean NOT NULL DEFAULT true;
