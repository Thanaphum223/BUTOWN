ALTER TABLE municipality ADD COLUMN center_latitude double precision NOT NULL DEFAULT 13.7563;
ALTER TABLE municipality ADD COLUMN center_longitude double precision NOT NULL DEFAULT 100.5018;
CREATE TABLE privacy_acknowledgement (
 user_id uuid NOT NULL REFERENCES app_user,
 notice_version varchar(80) NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,notice_version)
);
CREATE TABLE submission_key (
 user_id uuid NOT NULL REFERENCES app_user,
 operation varchar(100) NOT NULL,
 request_key uuid NOT NULL,
 request_hash varchar(64) NOT NULL,
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation,request_key)
);
ALTER TABLE attachment ADD COLUMN evidence_stage varchar(10) NOT NULL DEFAULT 'GENERAL'
 CHECK(evidence_stage IN ('GENERAL','BEFORE','AFTER'));
ALTER TABLE attachment ADD COLUMN public_approved boolean NOT NULL DEFAULT false;
ALTER TABLE complaint ADD COLUMN assignment_details jsonb NOT NULL DEFAULT '{}';
CREATE INDEX complaint_created_scope ON complaint(municipality_id,created_at DESC,id);
CREATE INDEX follower_user ON follower(user_id,complaint_id);
CREATE INDEX vote_complaint ON complaint_vote(complaint_id);

ALTER TABLE attachment ADD COLUMN storage_provider varchar(10) NOT NULL DEFAULT 'local' CHECK(storage_provider IN ('local','s3'));
