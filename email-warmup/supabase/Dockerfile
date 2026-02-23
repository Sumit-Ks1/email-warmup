FROM supabase/postgres:15.6.1.120

COPY schema.sql /docker-entrypoint-initdb.d/01-schema.sql

EXPOSE 5432
