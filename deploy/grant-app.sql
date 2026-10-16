-- Run explicitly after migrations, as agt_admin. No application DDL/admin rights.
GRANT USAGE ON SCHEMA public TO agt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE agt_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE agt_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO agt_app;
-- Migration bookkeeping must not be editable by the application role.
REVOKE ALL ON TABLE agt_schema_migrations FROM agt_app;
