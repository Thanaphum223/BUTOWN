-- Keep a private contact snapshot for new reports; historical reports stay unchanged.
ALTER TABLE complaint ADD COLUMN contact_email varchar(320);
