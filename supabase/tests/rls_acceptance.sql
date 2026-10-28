-- MANUAL DB ACCEPTANCE TEST. NOT RUN. Approval + dedicated test accounts required.
-- Run using psql against the approved ABAAD-EXHIBIT database after applying the setup.
-- Supply protocol_user_id, sales_user_id, admin_user_id and matching *_session_id via -v.
-- Sign each test account in normally first so auth.sessions contains its live session.
-- This uses transaction-local role impersonation to test PostgreSQL policies, not JWT verification.
-- Real HTTP Auth/JWT/refresh/browser tests are separately required.
\set ON_ERROR_STOP on
begin;

reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'protocol_user_id', 'session_id', :'protocol_session_id',
  'role', 'authenticated', 'is_anonymous', false,
  'exp', extract(epoch from now())::bigint + 300
)::text, true);
set local role authenticated;
do $$
declare affected bigint;
begin
  if (select count(*) from public.staff_roles) <> 1 then raise exception 'protocol: expected exactly own active row'; end if;
  if not exists(select 1 from public.staff_roles where role = 'protocol') then raise exception 'Test account has unexpected role'; end if;
  if exists(select 1 from public.staff_roles where user_id <> auth.uid()) then raise exception 'protocol: IDOR'; end if;
  begin
    update public.staff_roles set role = 'admin' where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protocol: self-escalation allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update public.staff_roles set is_active = false where user_id <> auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protocol: cross-user update allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.staff_roles(user_id, full_name, role) values (auth.uid(), 'RLS TEST ONLY', 'admin');
    raise exception 'protocol: insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.staff_roles where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'protocol: delete allowed'; end if;
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'sales_user_id', 'session_id', :'sales_session_id',
  'role', 'authenticated', 'is_anonymous', false,
  'exp', extract(epoch from now())::bigint + 300
)::text, true);
set local role authenticated;
do $$
declare affected bigint;
begin
  if (select count(*) from public.staff_roles) <> 1 then raise exception 'sales: expected exactly own active row'; end if;
  if not exists(select 1 from public.staff_roles where role = 'sales') then raise exception 'Test account has unexpected role'; end if;
  if exists(select 1 from public.staff_roles where user_id <> auth.uid()) then raise exception 'sales: IDOR'; end if;
  begin
    update public.staff_roles set role = 'admin' where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'sales: self-escalation allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update public.staff_roles set is_active = false where user_id <> auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'sales: cross-user update allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.staff_roles(user_id, full_name, role) values (auth.uid(), 'RLS TEST ONLY', 'admin');
    raise exception 'sales: insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.staff_roles where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'sales: delete allowed'; end if;
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'admin_user_id', 'session_id', :'admin_session_id',
  'role', 'authenticated', 'is_anonymous', false,
  'exp', extract(epoch from now())::bigint + 300
)::text, true);
set local role authenticated;
do $$
declare affected bigint;
begin
  if (select count(*) from public.staff_roles) <> 1 then raise exception 'admin: expected exactly own active row'; end if;
  if not exists(select 1 from public.staff_roles where role = 'admin') then raise exception 'Test account has unexpected role'; end if;
  if exists(select 1 from public.staff_roles where user_id <> auth.uid()) then raise exception 'admin: IDOR'; end if;
  begin
    update public.staff_roles set role = 'admin' where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'admin: self-escalation allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update public.staff_roles set is_active = false where user_id <> auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'admin: cross-user update allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.staff_roles(user_id, full_name, role) values (auth.uid(), 'RLS TEST ONLY', 'admin');
    raise exception 'admin: insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.staff_roles where user_id = auth.uid();
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'admin: delete allowed'; end if;
  exception when insufficient_privilege then null; end;
end $$;

reset role;
-- An expired JWT must see no rows, even with an otherwise live session.
select set_config('request.jwt.claims', json_build_object('sub', :'protocol_user_id', 'session_id', :'protocol_session_id', 'is_anonymous', false, 'exp', 1)::text, true);
set local role authenticated;
do $$ begin if exists(select 1 from public.staff_roles) then raise exception 'Expired session visible'; end if; end $$;
reset role;
-- Missing/revoked session id cannot read the role table.
select set_config('request.jwt.claims', json_build_object('sub', :'protocol_user_id', 'session_id', '', 'is_anonymous', false, 'exp', extract(epoch from now())::bigint + 300)::text, true);
set local role authenticated;
do $$ begin if exists(select 1 from public.staff_roles) then raise exception 'Missing session visible'; end if; end $$;
reset role;
update public.staff_roles set is_active = false where user_id = :'protocol_user_id'::uuid;
select set_config('request.jwt.claims', json_build_object('sub', :'protocol_user_id', 'session_id', :'protocol_session_id', 'is_anonymous', false, 'exp', extract(epoch from now())::bigint + 300)::text, true);
set local role authenticated;
do $$ begin if exists(select 1 from public.staff_roles) then raise exception 'Inactive employee visible'; end if; end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.staff_roles; raise exception 'Anonymous table read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
-- The transaction rolls back the temporary deactivation and any unexpected writes.
