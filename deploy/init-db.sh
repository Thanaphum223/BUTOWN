#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
\getenv app_password APP_DB_PASSWORD
SELECT format('CREATE ROLE towntrack LOGIN PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE towntrack TO towntrack;
GRANT USAGE,CREATE ON SCHEMA public TO towntrack;
SQL
