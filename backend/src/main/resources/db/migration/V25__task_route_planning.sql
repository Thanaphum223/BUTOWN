CREATE TABLE route_plan(
  id uuid PRIMARY KEY,
  municipality_id uuid NOT NULL REFERENCES municipality,
  department_id uuid NOT NULL,
  leader_id uuid NOT NULL REFERENCES app_user,
  created_by uuid NOT NULL REFERENCES app_user,
  confirmed_by uuid REFERENCES app_user,
  team_id uuid REFERENCES field_team,
  name varchar(200) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PROPOSED','DISPATCHED','DECLINED','CANCELLED')),
  version bigint NOT NULL DEFAULT 0,
  start_latitude double precision NOT NULL CHECK(start_latitude BETWEEN -90 AND 90),
  start_longitude double precision NOT NULL CHECK(start_longitude BETWEEN -180 AND 180),
  return_to_start boolean NOT NULL,
  optimized boolean NOT NULL,
  distance double precision NOT NULL CHECK(distance>=0),
  duration double precision NOT NULL CHECK(duration>=0),
  geometry jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  proposed_at timestamptz,
  confirmed_at timestamptz,
  FOREIGN KEY(department_id,municipality_id) REFERENCES department(id,municipality_id)
);
CREATE TABLE route_stop(
  plan_id uuid NOT NULL REFERENCES route_plan,
  complaint_id uuid NOT NULL REFERENCES complaint,
  stop_order integer NOT NULL CHECK(stop_order BETWEEN 1 AND 10),
  complaint_version bigint NOT NULL,
  title varchar(200) NOT NULL,
  address varchar(1000) NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  reserved boolean NOT NULL DEFAULT false,
  work_order_id uuid REFERENCES work_order,
  PRIMARY KEY(plan_id,complaint_id),
  UNIQUE(plan_id,stop_order)
);
CREATE UNIQUE INDEX one_proposed_route_per_case ON route_stop(complaint_id) WHERE reserved;
CREATE INDEX route_plan_queue ON route_plan(municipality_id,leader_id,status,created_at DESC);
CREATE INDEX route_stop_work ON route_stop(work_order_id);
