CREATE TABLE field_team(id uuid PRIMARY KEY,municipality_id uuid NOT NULL REFERENCES municipality,department_id uuid NOT NULL,leader_id uuid NOT NULL REFERENCES app_user,representative_id uuid NOT NULL REFERENCES app_user,name varchar(200) NOT NULL,active boolean NOT NULL DEFAULT true,FOREIGN KEY(department_id,municipality_id) REFERENCES department(id,municipality_id));
CREATE TABLE team_member(team_id uuid NOT NULL REFERENCES field_team,user_id uuid NOT NULL REFERENCES app_user,PRIMARY KEY(team_id,user_id));
ALTER TABLE work_order ADD COLUMN team_id uuid REFERENCES field_team;
CREATE TABLE work_member(work_order_id uuid NOT NULL REFERENCES work_order,user_id uuid NOT NULL REFERENCES app_user,PRIMARY KEY(work_order_id,user_id));
