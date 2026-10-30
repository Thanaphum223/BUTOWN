CREATE TABLE complaint_vote (
  complaint_id uuid NOT NULL REFERENCES complaint(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (complaint_id, user_id)
);
