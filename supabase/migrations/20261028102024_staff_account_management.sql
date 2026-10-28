-- gallery-org / pwlwelxnrrignapdsyiw only. No existing account is created or deleted by deployment.
begin;
alter table public.staff_roles add column if not exists deleted_at timestamptz;
create table abaad_private.staff_account_operations (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 action text not null check(action in ('create','delete')),
 request jsonb not null, email text, user_id uuid references auth.users(id),
 state text not null default 'pending' check(state in ('pending','done')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
alter table abaad_private.staff_account_operations enable row level security;
alter table abaad_private.staff_account_operations force row level security;
revoke all on abaad_private.staff_account_operations from public,anon,authenticated;
create unique index staff_account_pending_email on abaad_private.staff_account_operations(email) where action='create' and state='pending';
create index staff_account_actor on abaad_private.staff_account_operations(actor_id);
create index staff_account_user on abaad_private.staff_account_operations(user_id);

create function abaad_private.admin_staff_account(p_action text,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); operation_id uuid; operation abaad_private.staff_account_operations;
 target public.staff_roles; target_id uuid; full_name text; email_address text; staff_role text;
 exhibition_ids uuid[]; item uuid; payload jsonb; owned_auth uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('abaad:admin-staff-edit',0));
 if not coalesce(abaad_private.admin_authorized(),false) then raise insufficient_privilege;end if;
 if jsonb_typeof(p_request) is distinct from 'object' or p_action is null or p_action not in ('prepare_create','finish_create','prepare_delete','finish_delete') then raise invalid_parameter_value;end if;
 operation_id:=(p_request->>'operation_id')::uuid;
 if operation_id is null then raise invalid_parameter_value;end if;
 if p_action='prepare_create' then
  full_name:=trim(p_request->>'full_name'); email_address:=lower(trim(p_request->>'email')); staff_role:=p_request->>'role';
  if full_name is null or char_length(full_name) not between 2 and 120 or email_address is null or char_length(email_address)>254 or email_address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or staff_role is null or staff_role not in ('admin','protocol','sales') or jsonb_typeof(p_request->'exhibition_ids') is distinct from 'array' or jsonb_array_length(p_request->'exhibition_ids')>100 then raise invalid_parameter_value;end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into exhibition_ids from jsonb_array_elements_text(p_request->'exhibition_ids');
  if staff_role='admin' then exhibition_ids:='{}';elsif cardinality(exhibition_ids)=0 then raise invalid_parameter_value;end if;
  foreach item in array exhibition_ids loop
   if item is null or not exists(select 1 from public.protocol_exhibitions where id=item and is_active) then raise invalid_parameter_value;end if;
  end loop;
  payload:=jsonb_build_object('full_name',full_name,'email',email_address,'role',staff_role,'exhibition_ids',to_jsonb(exhibition_ids));
  select * into operation from abaad_private.staff_account_operations where id=operation_id for update;
  if found then
   if operation.actor_id<>actor or operation.action<>'create' or operation.request<>payload then return jsonb_build_object('ok',false,'code','operation_conflict');end if;
  else
   select * into operation from abaad_private.staff_account_operations where action='create' and state='pending' and email=email_address for update;
   if found then
    if operation.actor_id<>actor or operation.request<>payload then return jsonb_build_object('ok',false,'code','pending_conflict');end if;
   else
    if exists(select 1 from auth.users where lower(email)=email_address and deleted_at is null) then return jsonb_build_object('ok',false,'code','email_exists');end if;
    insert into abaad_private.staff_account_operations(id,actor_id,action,request,email) values(operation_id,actor,'create',payload,email_address) returning * into operation;
   end if;
  end if;
  if operation.state='done' then return jsonb_build_object('ok',true,'done',true,'user_id',operation.user_id,'operation_id',operation.id);end if;
  select u.id into owned_auth from auth.users u where lower(u.email)=email_address and u.deleted_at is null and u.raw_app_meta_data->>'abaad_staff_operation'=operation.id::text and u.raw_app_meta_data->>'abaad_staff_actor'=actor::text;
  return jsonb_build_object('ok',true,'operation_id',operation.id,'user_id',owned_auth);
 end if;
 select * into operation from abaad_private.staff_account_operations where id=operation_id for update;
 if p_action='finish_create' then
  if not found or operation.actor_id<>actor or operation.action<>'create' then raise insufficient_privilege;end if;
  if operation.state='done' then return jsonb_build_object('ok',true,'user_id',operation.user_id,'already',true);end if;
  target_id:=(p_request->>'user_id')::uuid;
  if target_id is null or not exists(select 1 from auth.users u where u.id=target_id and lower(u.email)=operation.email and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and u.raw_app_meta_data->>'abaad_staff_operation'=operation.id::text and u.raw_app_meta_data->>'abaad_staff_actor'=actor::text) then raise insufficient_privilege;end if;
  if exists(select 1 from public.staff_roles where user_id=target_id) then return jsonb_build_object('ok',false,'code','account_conflict');end if;
  staff_role:=operation.request->>'role';
  select coalesce(array_agg(value::uuid),'{}') into exhibition_ids from jsonb_array_elements_text(operation.request->'exhibition_ids');
  foreach item in array exhibition_ids loop
   if not exists(select 1 from public.protocol_exhibitions where id=item and is_active) then return jsonb_build_object('ok',false,'code','exhibition_changed');end if;
  end loop;
  insert into public.staff_roles(user_id,full_name,role,is_active) values(target_id,operation.request->>'full_name',staff_role,true);
  if staff_role='protocol' then insert into public.protocol_exhibition_staff(exhibition_id,user_id) select unnest(exhibition_ids),target_id;
  elsif staff_role='sales' then insert into public.sales_exhibition_staff(exhibition_id,user_id) select unnest(exhibition_ids),target_id;end if;
  update abaad_private.staff_account_operations set user_id=target_id,state='done',completed_at=clock_timestamp() where id=operation.id;
  return jsonb_build_object('ok',true,'user_id',target_id);
 end if;
 if p_action='prepare_delete' then
  target_id:=(p_request->>'user_id')::uuid;
  if target_id is null or target_id=actor then return jsonb_build_object('ok',false,'code','self_delete');end if;
  if operation.id is not null then
   if operation.actor_id<>actor or operation.action<>'delete' or operation.user_id<>target_id then return jsonb_build_object('ok',false,'code','operation_conflict');end if;
   return jsonb_build_object('ok',true,'done',operation.state='done','user_id',target_id,'operation_id',operation.id);
  end if;
  select * into target from public.staff_roles where user_id=target_id for update;
  if not found then return jsonb_build_object('ok',false,'code','not_staff');end if;
  if target.deleted_at is null and (p_request->>'expected_updated_at' is null or target.updated_at is distinct from (p_request->>'expected_updated_at')::timestamptz) then return jsonb_build_object('ok',false,'code','stale');end if;
  if target.role='admin' and target.is_active and (select count(*) from public.staff_roles where role='admin' and is_active and deleted_at is null)<=1 then return jsonb_build_object('ok',false,'code','last_admin');end if;
  insert into abaad_private.staff_account_operations(id,actor_id,action,request,user_id) values(operation_id,actor,'delete',jsonb_build_object('full_name',target.full_name,'role',target.role),target_id);
  update public.staff_roles set is_active=false,deleted_at=coalesce(deleted_at,clock_timestamp()),updated_at=clock_timestamp() where user_id=target_id;
  delete from public.protocol_exhibition_staff where user_id=target_id;
  delete from public.sales_exhibition_staff where user_id=target_id;
  delete from auth.sessions where user_id=target_id;
  return jsonb_build_object('ok',true,'user_id',target_id,'operation_id',operation_id);
 end if;
 if not found or operation.actor_id<>actor or operation.action<>'delete' then raise insufficient_privilege;end if;
 if operation.state='done' then return jsonb_build_object('ok',true,'already',true);end if;
 if exists(select 1 from auth.users where id=operation.user_id and deleted_at is null) then return jsonb_build_object('ok',false,'code','auth_delete_pending');end if;
 update abaad_private.staff_account_operations set state='done',completed_at=clock_timestamp() where id=operation.id;
 return jsonb_build_object('ok',true);
end$$;
create function public.admin_staff_account(p_action text,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.admin_staff_account(p_action,p_request);$$;
revoke all on function abaad_private.admin_staff_account(text,jsonb),public.admin_staff_account(text,jsonb) from public,anon,authenticated;
grant execute on function abaad_private.admin_staff_account(text,jsonb),public.admin_staff_account(text,jsonb) to authenticated;

create or replace function abaad_private.admin_staff_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not coalesce(abaad_private.admin_authorized(),false) then raise insufficient_privilege;end if;
 select jsonb_build_object('total',(select count(*)from public.staff_roles where deleted_at is null),'active_count',(select count(*)from public.staff_roles where is_active and deleted_at is null),
 'historical_staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'full_name',full_name)) from public.staff_roles where deleted_at is not null),'[]'::jsonb),'capabilities',jsonb_build_object('staff_updates',true,'guest_review',true,'account_creation',true,'account_deletion',true),
 'exhibitions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'slug',e.slug,'name',e.name,'is_active',e.is_active)order by e.name)from public.protocol_exhibitions e where e.is_active),'[]'::jsonb),
 'staff',coalesce((select jsonb_agg(to_jsonb(row)order by row.full_name,row.user_id)from(
 select s.user_id,s.full_name,u.email,s.role,s.is_active,s.created_at,s.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'slug',e.slug,'name',e.name)order by e.name)from public.protocol_exhibitions e where e.id in(
 select p.exhibition_id from public.protocol_exhibition_staff p where p.user_id=s.user_id union select a.exhibition_id from public.sales_exhibition_staff a where a.user_id=s.user_id)),'[]'::jsonb)exhibitions
 from public.staff_roles s left join auth.users u on u.id=s.user_id where s.deleted_at is null)row),'[]'::jsonb))into result;
 return result;
end$$;
create or replace function abaad_private.admin_update_staff(p_user_id uuid,p_full_name text,p_role text,p_is_active boolean,p_exhibition_ids uuid[],p_expected_updated_at timestamptz)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare target public.staff_roles;active_admins integer;exhibition uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('abaad:admin-staff-edit',0));
 if not coalesce(abaad_private.admin_authorized(),false)then raise insufficient_privilege;end if;
 if p_user_id is null or char_length(trim(coalesce(p_full_name,'')))not between 2 and 120 or p_role not in('admin','protocol','sales')or p_is_active is null or p_exhibition_ids is null or cardinality(p_exhibition_ids)>100 or p_expected_updated_at is null then raise invalid_parameter_value;end if;
 select * into target from public.staff_roles where user_id=p_user_id for update;
 if not found or target.deleted_at is not null then raise invalid_parameter_value;end if;
 if target.updated_at<>p_expected_updated_at then return jsonb_build_object('ok',false,'code','stale');end if;
 if p_user_id=auth.uid() and (p_role<>target.role or p_is_active<>target.is_active)then raise insufficient_privilege;end if;
 if target.role='admin'and target.is_active and(p_role<>'admin'or not p_is_active)then
 select count(*)into active_admins from public.staff_roles where role='admin'and is_active;
 if active_admins<=1 then raise exception 'Last active administrator cannot be disabled or demoted'using errcode='42501';end if;
 end if;
 foreach exhibition in array p_exhibition_ids loop
 if exhibition is null or not exists(select 1 from public.protocol_exhibitions where id=exhibition and is_active)then raise invalid_parameter_value;end if;
 end loop;
 update public.staff_roles set full_name=trim(p_full_name),role=p_role,is_active=p_is_active,updated_at=clock_timestamp()where user_id=p_user_id;
 -- Memberships do not confer a role. RLS still checks active staff role and a live session.
 delete from public.protocol_exhibition_staff where user_id=p_user_id;
 delete from public.sales_exhibition_staff where user_id=p_user_id;
 if p_role='protocol'then
 insert into public.protocol_exhibition_staff(exhibition_id,user_id)select distinct id,p_user_id from unnest(p_exhibition_ids)ids(id);
 elsif p_role='sales'then
 insert into public.sales_exhibition_staff(exhibition_id,user_id)select distinct id,p_user_id from unnest(p_exhibition_ids)ids(id);
 end if;
 return jsonb_build_object('ok',true);
end$$;
alter table public.staff_roles add constraint staff_deleted_inactive check(deleted_at is null or not is_active);
notify pgrst,'reload schema';
commit;
