CREATE TABLE gov_role_settings (
 municipality_id uuid PRIMARY KEY REFERENCES municipality,
 gov_municipality_id varchar(200) NOT NULL DEFAULT '',
 gov_service_id varchar(200) NOT NULL DEFAULT ''
);
CREATE TABLE gov_role_mapping (
 municipality_id uuid NOT NULL REFERENCES gov_role_settings,
 gov_role varchar(100) NOT NULL,
 local_role varchar(20) NOT NULL CHECK(local_role IN ('CITIZEN','OFFICER','LEADER','FIELD','APPROVER','ADMIN')),
 department_id uuid,
 PRIMARY KEY(municipality_id,gov_role),
 FOREIGN KEY(department_id,municipality_id) REFERENCES department(id,municipality_id),
 CHECK(local_role IN ('LEADER','FIELD') OR department_id IS NULL)
);
