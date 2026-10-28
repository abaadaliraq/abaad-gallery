-- READ-ONLY deployment evidence, NOT an RLS behavioral test. Run only on the approved project.
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'staff_roles' order by ordinal_position;
select c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'staff_roles';
select policyname, permissive, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'staff_roles';
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'staff_roles';
select p.proname, p.prosecdef, p.proconfig, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'abaad_private';
