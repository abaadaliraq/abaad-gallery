-- PHASE 02: FRESH INSTALL ONLY. NOT EXECUTED. Review + explicit approval required.
-- Do not run against an existing staff_roles table. Use the reviewed upgrade file instead.
begin;
create table public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  role text not null check (role in ('protocol', 'sales', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Email/password remain in Supabase Auth. No duplicate email or password columns.
-- A dedicated, non-exposed schema. No staff data or arbitrary user-id inputs.
create schema if not exists abaad_private;
revoke all on schema abaad_private from public, anon, authenticated;
grant usage on schema abaad_private to authenticated;

-- SECURITY DEFINER is required ONLY to read auth.sessions, inaccessible to app users.
-- This returns one boolean about the caller's own signed session; it never grants a role.
create function abaad_private.has_live_session()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt())->>'is_anonymous', 'true') = 'false'
    and coalesce(((select auth.jwt())->>'exp')::numeric, 0) > extract(epoch from statement_timestamp())
    and exists (
      select 1 from auth.sessions as s
      where s.user_id = (select auth.uid())
        and s.id::text = ((select auth.jwt())->>'session_id')
        and (s.not_after is null or s.not_after > statement_timestamp())
    );
$$;
revoke all on function abaad_private.has_live_session() from public, anon, authenticated;
grant execute on function abaad_private.has_live_session() to authenticated;

create function abaad_private.touch_staff_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
revoke all on function abaad_private.touch_staff_updated_at() from public, anon, authenticated;
create trigger staff_roles_updated_at before update on public.staff_roles
for each row execute function abaad_private.touch_staff_updated_at();

alter table public.staff_roles enable row level security;
alter table public.staff_roles force row level security;
revoke all on public.staff_roles from public, anon, authenticated;
grant select on public.staff_roles to authenticated;
grant select, insert, update, delete on public.staff_roles to service_role;

create policy staff_select_own_active on public.staff_roles
for select to authenticated using ((select auth.uid()) = user_id and is_active);
-- A restrictive boundary prevents a future permissive SELECT policy widening this access.
create policy staff_select_session_boundary on public.staff_roles as restrictive
for select to authenticated using (
  (select auth.uid()) = user_id and is_active and (select abaad_private.has_live_session())
);
-- Explicit deny policies, in addition to revoked write privileges. Even app admins cannot self-promote.
create policy staff_insert_denied on public.staff_roles as restrictive
for insert to authenticated with check (false);
create policy staff_update_denied on public.staff_roles as restrictive
for update to authenticated using (false) with check (false);
create policy staff_delete_denied on public.staff_roles as restrictive
for delete to authenticated using (false);

commit;
