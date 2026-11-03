ALTER TABLE app_user ADD CONSTRAINT app_user_id_municipality_unique UNIQUE(id,municipality_id);
CREATE TABLE iam_user_profile (
 municipality_id uuid NOT NULL REFERENCES municipality,
 iam_user_id varchar(200) NOT NULL,
 local_user_id uuid NOT NULL UNIQUE,
 email varchar(320), display_name varchar(200), last_sso_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(municipality_id,iam_user_id),
 FOREIGN KEY(local_user_id,municipality_id) REFERENCES app_user(id,municipality_id)
);
CREATE TABLE iam_residence_snapshot (
 municipality_id uuid NOT NULL REFERENCES municipality,
 iam_residence_id varchar(200) NOT NULL,
 residence_status varchar(50) NOT NULL,
 formatted_address text,
 address_snapshot jsonb NOT NULL,
 synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(municipality_id,iam_residence_id)
);
CREATE TABLE iam_user_residence (
 municipality_id uuid NOT NULL,
 iam_user_id varchar(200) NOT NULL,
 iam_residence_id varchar(200) NOT NULL,
 iam_membership_id varchar(200) NOT NULL,
 member_role varchar(50), member_status varchar(50) NOT NULL, residence_status varchar(50) NOT NULL,
 verified_at timestamptz, synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(municipality_id,iam_user_id,iam_residence_id),
 FOREIGN KEY(municipality_id,iam_user_id) REFERENCES iam_user_profile(municipality_id,iam_user_id),
 FOREIGN KEY(municipality_id,iam_residence_id) REFERENCES iam_residence_snapshot(municipality_id,iam_residence_id)
);
