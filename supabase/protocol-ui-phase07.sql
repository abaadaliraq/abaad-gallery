-- ABAAD EXHIBIT Phase 07 — REVIEW ONLY. NOT EXECUTED.
-- Target pwlwelxnrrignapdsyiw. Requires Phase 02/03. Sales/booking triggers are conditional.
-- No existing guest identity, priority, arrival, role or Auth setting is changed.
begin;
alter table public.protocol_invitations
 add column is_archived boolean not null default false,
 add column archived_at timestamptz,
 add column archived_by uuid references auth.users(id),
 add column archive_reason text check(char_length(archive_reason)<=500),
 add constraint protocol_invitation_archive_state check(
  (is_archived and archived_at is not null and archived_by is not null)
  or (not is_archived and archived_at is null and archived_by is null and archive_reason is null));
create index protocol_invitation_active_priority_idx on public.protocol_invitations(exhibition_id,priority_level,display_order,id) where not is_archived;
create index protocol_invitation_archive_actor_idx on public.protocol_invitations(archived_by) where archived_by is not null;
create table public.protocol_invitation_archive_events (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null references public.protocol_invitations(id),
 exhibition_id uuid not null references public.protocol_exhibitions(id), actor_id uuid not null references auth.users(id),
 operation_id uuid not null unique, action text not null check(action in ('archive','restore')),
 reason text not null default '' check(char_length(reason)<=500), reviewed_arrival boolean not null,
 request_fingerprint text not null, previous_checked_in_at timestamptz, created_at timestamptz not null default now()
);
create index protocol_archive_events_invitation_idx on public.protocol_invitation_archive_events(invitation_id,created_at);
create index protocol_archive_events_exhibition_idx on public.protocol_invitation_archive_events(exhibition_id,created_at);
create index protocol_archive_events_actor_idx on public.protocol_invitation_archive_events(actor_id);
alter table public.protocol_invitation_archive_events enable row level security;
alter table public.protocol_invitation_archive_events force row level security;
revoke all on public.protocol_invitation_archive_events from public,anon,authenticated,service_role;
grant select on public.protocol_invitation_archive_events to authenticated;
create policy protocol_archive_events_admin_read on public.protocol_invitation_archive_events for select to authenticated
 using((select abaad_private.protocol_actor_role())='admin' and abaad_private.protocol_allowed(exhibition_id));
-- Narrow only archived invitation visibility. Staff roles, memberships and Auth policies remain unchanged.
alter policy protocol_invitations_read on public.protocol_invitations
 using(abaad_private.protocol_allowed(exhibition_id) and (not is_archived or (select abaad_private.protocol_actor_role())='admin'));

create table abaad_private.ui_revisions (
 exhibition_id uuid not null references public.protocol_exhibitions(id),
 scope text not null check(scope in ('protocol','bookings','sales','staff','settings')),
 revision bigint not null default 0, primary key(exhibition_id,scope)
);
alter table abaad_private.ui_revisions enable row level security;
revoke all on abaad_private.ui_revisions from public,anon,authenticated,service_role;
insert into abaad_private.ui_revisions(exhibition_id,scope)
 select e.id,s.scope from public.protocol_exhibitions e cross join unnest(array['protocol','bookings','sales','staff','settings']) s(scope);
create function abaad_private.ui_bump_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into abaad_private.ui_revisions(exhibition_id,scope,revision)
 select e.id,tg_argv[0],1 from public.protocol_exhibitions e
 on conflict(exhibition_id,scope) do update set revision=abaad_private.ui_revisions.revision+1;
 return null;
end $$;
revoke all on function abaad_private.ui_bump_revision() from public,anon,authenticated,service_role;
-- Statement triggers publish opaque counters only; they never write to the application rows being changed.
do $$ declare pair text[]; begin
 foreach pair slice 1 in array array[
 ['protocol_invitations','protocol'],['protocol_guests','protocol'],['protocol_categories','protocol'],
 ['protocol_exhibition_staff','protocol'],['protocol_attendance_events','protocol'],
 ['exhibition_bookings','bookings'],['exhibition_booking_slots','bookings'],
 ['artworks','sales'],['artwork_artists','sales'],['exhibition_artists','sales'],
 ['exhibition_artworks','sales'],['sales_exhibition_staff','sales'],['artwork_status_history','sales'],
 ['staff_roles','staff'],['protocol_exhibitions','settings']
 ] loop
  if to_regclass('public.'||pair[1]) is not null then
   execute format('create trigger phase07_ui_revision after insert or update or delete on public.%I for each statement execute function abaad_private.ui_bump_revision(%L)',pair[1],pair[2]);
  end if;
 end loop;
end $$;

create function abaad_private.ui_revision_snapshot(p_slug text,p_scopes text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; actor text; wanted text; revisions jsonb:='{}'; token text;
begin
 select role into actor from public.staff_roles where user_id=auth.uid() and is_active and abaad_private.has_live_session();
 select id into target from public.protocol_exhibitions where slug=p_slug and is_active;
 if actor is null or target is null or coalesce(cardinality(p_scopes),0) not between 1 and 6 then raise insufficient_privilege; end if;
 foreach wanted in array p_scopes loop
  if wanted in ('protocol','bookings') then
   if not coalesce(abaad_private.protocol_allowed(target),false) then raise insufficient_privilege; end if;
  elsif wanted='sales' then
   if actor<>'admin' and actor<>'sales' then raise insufficient_privilege; end if;
   if to_regprocedure('abaad_private.sales_allowed(uuid)') is null then raise insufficient_privilege; end if;
   execute 'select abaad_private.sales_allowed($1)' into token using target;
   if token is distinct from 'true' then raise insufficient_privilege; end if;
  elsif wanted in ('staff','settings','overview') then
   if actor<>'admin' then raise insufficient_privilege; end if;
  else raise insufficient_privilege;
  end if;
  if wanted='overview' then
   select md5(coalesce(string_agg(scope||':'||revision::text,',' order by scope),'')) into token from abaad_private.ui_revisions where exhibition_id=target;
  else select coalesce(revision::text,'0') into token from abaad_private.ui_revisions where exhibition_id=target and scope=wanted;
  end if;
  revisions:=revisions||jsonb_build_object(wanted,coalesce(token,'0'));
 end loop;
 return jsonb_build_object('revisions',revisions,'observed_at',statement_timestamp());
end $$;

create function abaad_private.admin_archive_invitation(p_id uuid,p_archived boolean,p_reason text,p_operation uuid,p_expected_updated_at timestamptz,p_reviewed_arrival boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.protocol_invitations; event public.protocol_invitation_archive_events; fingerprint text;
begin
 if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
 select * into row from public.protocol_invitations where id=p_id;
 if not found or not coalesce(abaad_private.protocol_allowed(row.exhibition_id),false) then raise insufficient_privilege; end if;
 if p_archived is null or p_operation is null or p_expected_updated_at is null or p_reviewed_arrival is null or char_length(coalesce(p_reason,''))>500 then raise invalid_parameter_value; end if;
 fingerprint:=md5(jsonb_build_array(p_id,p_archived,coalesce(p_reason,''),p_expected_updated_at,p_reviewed_arrival)::text);
 -- Same exhibit lock used by the safe CSV merge: import retries cannot reactivate an archived invitation.
 perform pg_advisory_xact_lock(hashtextextended(row.exhibition_id::text,0));
 select * into row from public.protocol_invitations where id=p_id for update;
 select * into event from public.protocol_invitation_archive_events where operation_id=p_operation;
 if found then
  if event.actor_id<>auth.uid() or event.request_fingerprint<>fingerprint then raise invalid_parameter_value; end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 if row.updated_at<>p_expected_updated_at then return jsonb_build_object('ok',false,'code','stale'); end if;
 if row.is_archived=p_archived then return jsonb_build_object('ok',true,'already',true); end if;
 if p_archived and row.checked_in_at is not null and (not p_reviewed_arrival or char_length(trim(coalesce(p_reason,'')))<5) then return jsonb_build_object('ok',false,'code','arrival_review_required'); end if;
 update public.protocol_invitations set is_archived=p_archived,archived_at=case when p_archived then clock_timestamp() else null end,
  archived_by=case when p_archived then auth.uid() else null end,archive_reason=case when p_archived then coalesce(p_reason,'') else null end,
  updated_at=clock_timestamp() where id=p_id;
 insert into public.protocol_invitation_archive_events(invitation_id,exhibition_id,actor_id,operation_id,action,reason,reviewed_arrival,request_fingerprint,previous_checked_in_at)
 values(row.id,row.exhibition_id,auth.uid(),p_operation,case when p_archived then 'archive' else 'restore' end,coalesce(p_reason,''),p_reviewed_arrival,fingerprint,row.checked_in_at);
 return jsonb_build_object('ok',true);
end $$;

create function abaad_private.admin_guest_page(p_slug text,p_query text default '',p_category uuid default null,p_attendance text default 'all',p_page integer default 1,p_priority text default 'all',p_review text default 'all',p_archive text default 'active')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
 if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
 select id into target from public.protocol_exhibitions where slug=p_slug;
 if target is null or not coalesce(abaad_private.protocol_allowed(target),false) then raise insufficient_privilege; end if;
 if p_archive not in ('active','archived') or p_review not in ('all','pending','approved') or p_priority not in ('all','vvip','vip','priority','regular')
  or p_attendance not in ('all','arrived','pending') or p_page not between 1 and 10000 or char_length(p_query)>200 then raise invalid_parameter_value; end if;
 with all_guests as (
  select i.id,i.guest_id,g.full_name_ar,g.full_name_en,g.official_title,g.organization,g.photo_public_id,g.photo_url,g.photo_gravity,
   i.priority_level,i.review_required,i.review_note,i.source_key,i.source_record_key,i.source_description,i.category_id,c.label category_label,
   i.seating_location,i.internal_notes,i.checked_in_at,i.checked_in_by,i.display_order,
   i.updated_at invitation_updated_at,g.updated_at guest_updated_at,i.is_archived,i.archived_at,i.archived_by,i.archive_reason,s.full_name archived_by_name
  from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
  left join public.protocol_categories c on c.id=i.category_id and c.exhibition_id=i.exhibition_id
  left join public.staff_roles s on s.user_id=i.archived_by where i.exhibition_id=target
 ), matched as (
  select * from all_guests g where g.is_archived=(p_archive='archived') and (p_priority='all' or g.priority_level=p_priority)
   and (p_category is null or g.category_id=p_category) and (p_review='all' or g.review_required=(p_review='pending'))
   and (p_attendance='all' or p_attendance='arrived' and g.checked_in_at is not null or p_attendance='pending' and g.checked_in_at is null)
   and strpos(abaad_private.protocol_normalize(concat_ws(' ',g.full_name_ar,g.full_name_en,g.official_title,g.organization)),abaad_private.protocol_normalize(p_query))>0
 ), page as (select * from matched order by case priority_level when 'vvip' then 0 when 'vip' then 1 when 'priority' then 2 else 3 end,display_order,full_name_ar,id limit 20 offset (p_page-1)*20)
 select jsonb_build_object('exhibition_id',target,'observed_at',statement_timestamp(),
  'total',(select count(*) from all_guests where not is_archived),'checked_in',(select count(*) from all_guests where not is_archived and checked_in_at is not null),
  'pending',(select count(*) from all_guests where not is_archived and checked_in_at is null),'review_total',(select count(*) from all_guests where not is_archived and review_required),
  'archived_total',(select count(*) from all_guests where is_archived),'total_matches',(select count(*) from matched),'page',p_page,'page_size',20,
  'guests',coalesce((select jsonb_agg(to_jsonb(p) order by case p.priority_level when 'vvip' then 0 when 'vip' then 1 when 'priority' then 2 else 3 end,p.display_order,p.full_name_ar,p.id) from page p),'[]'),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label) order by display_order,label) from public.protocol_categories where exhibition_id=target),'[]'),
  'archiving_ready',true,'review_ready',to_regprocedure('public.admin_approve_guest(uuid,timestamp with time zone,timestamp with time zone)') is not null,
  'selected_slug',p_slug,'exhibitions',(select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name',name,'is_active',is_active) order by name) from public.protocol_exhibitions where is_active)) into result;
 return result;
end $$;

-- Keep the original snapshot contract and priority ordering; exclude only archived invitations.
create or replace function public.protocol_snapshot(p_slug text, p_query text default '', p_category uuid default null,
  p_attendance text default 'all', p_page integer default 1, p_priority text default 'all') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare target uuid; result jsonb;
begin
  select e.id into target from public.protocol_exhibitions e where e.slug=p_slug;
  if target is null or not abaad_private.protocol_allowed(target) then raise insufficient_privilege; end if;
  if p_priority not in ('all','vvip','vip','priority','regular') or char_length(p_query)>200 or p_attendance not in ('all','arrived','pending') or p_page<1 or p_page>10000 then raise invalid_parameter_value; end if;
  with all_guests as (
    select i.id, i.guest_id, g.full_name_ar, g.full_name_en, g.official_title, g.organization,
      g.photo_public_id, g.photo_url, g.photo_gravity, i.priority_level, i.review_required, i.review_note, i.source_key, i.source_record_key, i.source_description, i.category_id, c.label as category_label, i.seating_location, i.internal_notes,
      i.checked_in_at, i.checked_in_by, i.display_order
    from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
    left join public.protocol_categories c on c.id=i.category_id and c.exhibition_id=i.exhibition_id
    where i.exhibition_id=target and not i.is_archived
  ), matched as (
    select * from all_guests g where (p_priority='all' or g.priority_level=p_priority) and (p_category is null or g.category_id=p_category)
    and (p_attendance='all' or (p_attendance='arrived' and g.checked_in_at is not null) or (p_attendance='pending' and g.checked_in_at is null))
    and strpos(abaad_private.protocol_normalize(concat_ws(' ',g.full_name_ar,g.full_name_en,g.official_title,g.organization)),abaad_private.protocol_normalize(p_query))>0
  ), page as (select * from matched order by case priority_level when 'vvip' then 0 when 'vip' then 1 when 'priority' then 2 else 3 end,display_order,full_name_ar,id limit 24 offset ((p_page-1)*24))
  select jsonb_build_object('exhibition_id',target,'observed_at',statement_timestamp(),
    'total',(select count(*) from all_guests),
    'checked_in',(select count(*) from all_guests where checked_in_at is not null),
    'pending',(select count(*) from all_guests where checked_in_at is null),
    'total_matches',(select count(*) from matched),'page',p_page,'page_size',24,
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.label) order by c.display_order,c.label) from public.protocol_categories c where c.exhibition_id=target),'[]'::jsonb),
    'guests',coalesce((select jsonb_agg(to_jsonb(p) order by case p.priority_level when 'vvip' then 0 when 'vip' then 1 when 'priority' then 2 else 3 end,p.display_order,p.full_name_ar,p.id) from page p),'[]'::jsonb)) into result;
  return result;
end $$;
create or replace function abaad_private.protocol_check_in(p_invitation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare current_row public.protocol_invitations; already boolean;
begin
  select * into current_row from public.protocol_invitations where id=p_invitation_id for update;
  if not found or not coalesce(abaad_private.protocol_allowed(current_row.exhibition_id),false) then raise insufficient_privilege; end if;
  if current_row.is_archived then raise insufficient_privilege; end if;
  already := current_row.checked_in_at is not null;
  if not already then
    update public.protocol_invitations set checked_in_at=clock_timestamp(),checked_in_by=auth.uid(),updated_at=clock_timestamp()
      where id=p_invitation_id returning * into current_row;
    insert into public.protocol_attendance_events(invitation_id,exhibition_id,actor_id,action)
      values(current_row.id,current_row.exhibition_id,auth.uid(),'check_in');
  end if;
  return jsonb_build_object('id',current_row.id,'checked_in_at',current_row.checked_in_at,'already_checked_in',already);
end $$;

create function public.ui_revision_snapshot(p_slug text,p_scopes text[]) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.ui_revision_snapshot(p_slug,p_scopes);$$;
revoke all on function public.ui_revision_snapshot(text,text[]) from public,anon,authenticated,service_role;
revoke all on function abaad_private.ui_revision_snapshot(text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.ui_revision_snapshot(text,text[]) to authenticated;
grant execute on function abaad_private.ui_revision_snapshot(text,text[]) to authenticated;

create function public.admin_archive_invitation(p_id uuid,p_archived boolean,p_reason text,p_operation uuid,p_expected_updated_at timestamptz,p_reviewed_arrival boolean) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.admin_archive_invitation(p_id,p_archived,p_reason,p_operation,p_expected_updated_at,p_reviewed_arrival);$$;
revoke all on function public.admin_archive_invitation(uuid,boolean,text,uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
revoke all on function abaad_private.admin_archive_invitation(uuid,boolean,text,uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_archive_invitation(uuid,boolean,text,uuid,timestamptz,boolean) to authenticated;
grant execute on function abaad_private.admin_archive_invitation(uuid,boolean,text,uuid,timestamptz,boolean) to authenticated;

create function public.admin_guest_page(p_slug text,p_query text default '',p_category uuid default null,p_attendance text default 'all',p_page integer default 1,p_priority text default 'all',p_review text default 'all',p_archive text default 'active') returns jsonb language sql security invoker set search_path='' as $$select abaad_private.admin_guest_page(p_slug,p_query,p_category,p_attendance,p_page,p_priority,p_review,p_archive);$$;
revoke all on function public.admin_guest_page(text,text,uuid,text,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function abaad_private.admin_guest_page(text,text,uuid,text,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_guest_page(text,text,uuid,text,integer,text,text,text) to authenticated;
grant execute on function abaad_private.admin_guest_page(text,text,uuid,text,integer,text,text,text) to authenticated;

-- Replacement functions retain their original invoker/definer boundaries and ACLs.
commit;
