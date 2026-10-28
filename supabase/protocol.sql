-- UPDATED FOR THE USER-SUPPLIED 34-RECORD CSV: priority, review, provenance and safe rerunnable import.
-- ABAAD EXHIBIT Phase 03. REVIEW ONLY: NOT EXECUTED.
-- Target pwlwelxnrrignapdsyiw only. Does not ALTER staff_roles or existing Auth functions/policies.
begin;
do $$ begin
  if to_regclass('public.staff_roles') is null
    or to_regprocedure('abaad_private.has_live_session()') is null then
    raise exception 'Reviewed Phase 02 authentication foundation is required';
  end if;
end $$;

create table public.protocol_exhibitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(char_length(slug) between 1 and 100),
  name text not null check(char_length(name) between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.protocol_exhibition_staff (
  exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
  user_id uuid not null references public.staff_roles(user_id) on delete cascade,
  primary key(exhibition_id,user_id)
);
create index protocol_staff_user_idx on public.protocol_exhibition_staff(user_id,exhibition_id);
create table public.protocol_categories (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
  label text not null check(char_length(trim(label)) between 1 and 80),
  display_order integer not null default 0,
  unique(exhibition_id,label), unique(exhibition_id,id)
);
create table public.protocol_guests (
  id uuid primary key default gen_random_uuid(),
  full_name_ar text not null check(char_length(trim(full_name_ar)) between 2 and 160),
  full_name_en text check(char_length(full_name_en)<=160),
  official_title text not null default '' check(char_length(official_title)<=240),
  organization text not null default '' check(char_length(organization)<=240),
  photo_url text check (photo_url is null or (char_length(photo_url)<=1000 and photo_url ~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/' and photo_url !~ '[?#]')),
  photo_gravity text not null default 'face' check(photo_gravity in ('face','auto','north','center')),
  photo_public_id text check(char_length(photo_public_id)<=250 and photo_public_id ~ '^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$' and photo_public_id !~ '(^|/)\.\.?(/|$)'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.protocol_invitations (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
  guest_id uuid not null references public.protocol_guests(id) on delete restrict,
  category_id uuid,
  seating_location text check(char_length(seating_location)<=160),
  internal_notes text check(char_length(internal_notes)<=2000),
  display_order integer not null default 0,
  dedup_key text not null,
  priority_level text not null default 'regular' check(priority_level in ('vvip','vip','priority','regular')),
  review_required boolean not null default false,
  review_note text check(char_length(review_note)<=2000),
  source_key text check(char_length(source_key) between 1 and 160),
  source_record_key text check(char_length(source_record_key) between 1 and 100),
  source_description text check(char_length(source_description)<=240),
  source_fingerprint text check(source_fingerprint ~ '^[a-f0-9]{32}$'),
  check((source_key is null) = (source_record_key is null)),
  unique(exhibition_id,source_key,source_record_key),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exhibition_id,guest_id), unique(exhibition_id,dedup_key),
  foreign key(exhibition_id,category_id) references public.protocol_categories(exhibition_id,id),
  check(checked_in_at is not null or checked_in_by is null)
);
create index protocol_invitation_list_idx on public.protocol_invitations(exhibition_id,display_order,id);
create index protocol_invitation_priority_idx on public.protocol_invitations(exhibition_id,priority_level,display_order,id);
create index protocol_invitation_status_idx on public.protocol_invitations(exhibition_id,checked_in_at);
create index protocol_invitation_category_idx on public.protocol_invitations(exhibition_id,category_id);
create index protocol_invitation_guest_idx on public.protocol_invitations(guest_id);
create table public.protocol_attendance_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.protocol_invitations(id) on delete restrict,
  exhibition_id uuid not null references public.protocol_exhibitions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('check_in','undo_check_in')),
  reason text,
  previous_checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  check(action <> 'undo_check_in' or char_length(trim(reason)) between 5 and 500)
);
create index protocol_events_invitation_idx on public.protocol_attendance_events(invitation_id,created_at);

-- New helpers only. Definer scope is intentionally narrow, with no role or user-id inputs.
create function abaad_private.protocol_actor_role() returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_roles s
  where s.user_id=(select auth.uid()) and s.is_active
    and s.role in ('protocol','admin') and (select abaad_private.has_live_session());
$$;
create function abaad_private.protocol_allowed(p_exhibition_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.protocol_exhibitions e where e.id=p_exhibition_id and e.is_active)
    and ((select abaad_private.protocol_actor_role())='admin'
      or ((select abaad_private.protocol_actor_role())='protocol' and exists(
        select 1 from public.protocol_exhibition_staff m
        where m.exhibition_id=p_exhibition_id and m.user_id=(select auth.uid())
      )));
$$;
revoke all on function abaad_private.protocol_actor_role() from public,anon,authenticated;
revoke all on function abaad_private.protocol_allowed(uuid) from public,anon,authenticated;
grant execute on function abaad_private.protocol_actor_role() to authenticated;
grant execute on function abaad_private.protocol_allowed(uuid) to authenticated;

create function abaad_private.protocol_normalize(value text) returns text
language sql immutable security invoker set search_path = '' as $$
  select trim(regexp_replace(translate(regexp_replace(lower(normalize(coalesce(value,''),NFKC)),
    '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'), 'أإآٱىؤئ', 'اااايوي'), '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function abaad_private.protocol_normalize(text) from public,anon,authenticated;
grant execute on function abaad_private.protocol_normalize(text) to authenticated;

-- RLS and explicit privileges for every NEW table. No direct client writes.
alter table public.protocol_exhibitions enable row level security;
alter table public.protocol_exhibitions force row level security;
revoke all on public.protocol_exhibitions from public,anon,authenticated;
grant select on public.protocol_exhibitions to authenticated;
create policy protocol_exhibitions_no_insert on public.protocol_exhibitions as restrictive for insert to authenticated with check(false);
create policy protocol_exhibitions_no_update on public.protocol_exhibitions as restrictive for update to authenticated using(false) with check(false);
create policy protocol_exhibitions_no_delete on public.protocol_exhibitions as restrictive for delete to authenticated using(false);
alter table public.protocol_exhibition_staff enable row level security;
alter table public.protocol_exhibition_staff force row level security;
revoke all on public.protocol_exhibition_staff from public,anon,authenticated;
grant select on public.protocol_exhibition_staff to authenticated;
create policy protocol_exhibition_staff_no_insert on public.protocol_exhibition_staff as restrictive for insert to authenticated with check(false);
create policy protocol_exhibition_staff_no_update on public.protocol_exhibition_staff as restrictive for update to authenticated using(false) with check(false);
create policy protocol_exhibition_staff_no_delete on public.protocol_exhibition_staff as restrictive for delete to authenticated using(false);
alter table public.protocol_categories enable row level security;
alter table public.protocol_categories force row level security;
revoke all on public.protocol_categories from public,anon,authenticated;
grant select on public.protocol_categories to authenticated;
create policy protocol_categories_no_insert on public.protocol_categories as restrictive for insert to authenticated with check(false);
create policy protocol_categories_no_update on public.protocol_categories as restrictive for update to authenticated using(false) with check(false);
create policy protocol_categories_no_delete on public.protocol_categories as restrictive for delete to authenticated using(false);
alter table public.protocol_guests enable row level security;
alter table public.protocol_guests force row level security;
revoke all on public.protocol_guests from public,anon,authenticated;
grant select on public.protocol_guests to authenticated;
create policy protocol_guests_no_insert on public.protocol_guests as restrictive for insert to authenticated with check(false);
create policy protocol_guests_no_update on public.protocol_guests as restrictive for update to authenticated using(false) with check(false);
create policy protocol_guests_no_delete on public.protocol_guests as restrictive for delete to authenticated using(false);
alter table public.protocol_invitations enable row level security;
alter table public.protocol_invitations force row level security;
revoke all on public.protocol_invitations from public,anon,authenticated;
grant select on public.protocol_invitations to authenticated;
create policy protocol_invitations_no_insert on public.protocol_invitations as restrictive for insert to authenticated with check(false);
create policy protocol_invitations_no_update on public.protocol_invitations as restrictive for update to authenticated using(false) with check(false);
create policy protocol_invitations_no_delete on public.protocol_invitations as restrictive for delete to authenticated using(false);
alter table public.protocol_attendance_events enable row level security;
alter table public.protocol_attendance_events force row level security;
revoke all on public.protocol_attendance_events from public,anon,authenticated;
grant select on public.protocol_attendance_events to authenticated;
create policy protocol_attendance_events_no_insert on public.protocol_attendance_events as restrictive for insert to authenticated with check(false);
create policy protocol_attendance_events_no_update on public.protocol_attendance_events as restrictive for update to authenticated using(false) with check(false);
create policy protocol_attendance_events_no_delete on public.protocol_attendance_events as restrictive for delete to authenticated using(false);

create policy protocol_exhibitions_read on public.protocol_exhibitions for select to authenticated
using(abaad_private.protocol_allowed(id));
create policy protocol_membership_read on public.protocol_exhibition_staff for select to authenticated
using((user_id=(select auth.uid()) or (select abaad_private.protocol_actor_role())='admin') and abaad_private.protocol_allowed(exhibition_id));
create policy protocol_categories_read on public.protocol_categories for select to authenticated
using(abaad_private.protocol_allowed(exhibition_id));
create policy protocol_invitations_read on public.protocol_invitations for select to authenticated
using(abaad_private.protocol_allowed(exhibition_id));
create policy protocol_guests_read on public.protocol_guests for select to authenticated using(
  (select abaad_private.protocol_actor_role())='admin' or exists(
    select 1 from public.protocol_invitations i where i.guest_id=protocol_guests.id and abaad_private.protocol_allowed(i.exhibition_id)
  )
);
create policy protocol_events_read on public.protocol_attendance_events for select to authenticated
using((select abaad_private.protocol_actor_role())='admin' and abaad_private.protocol_allowed(exhibition_id));

-- Snapshot is INVOKER: all joins remain subject to RLS; one statement gives consistent totals.
create function public.protocol_snapshot(p_slug text, p_query text default '', p_category uuid default null,
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
    where i.exhibition_id=target
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

-- Serialized, idempotent attendance transition. No caller-supplied timestamp or staff id.
create function abaad_private.protocol_check_in(p_invitation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare current_row public.protocol_invitations; already boolean;
begin
  select * into current_row from public.protocol_invitations where id=p_invitation_id for update;
  if not found or not coalesce(abaad_private.protocol_allowed(current_row.exhibition_id),false) then raise insufficient_privilege; end if;
  already := current_row.checked_in_at is not null;
  if not already then
    update public.protocol_invitations set checked_in_at=clock_timestamp(),checked_in_by=auth.uid(),updated_at=clock_timestamp()
      where id=p_invitation_id returning * into current_row;
    insert into public.protocol_attendance_events(invitation_id,exhibition_id,actor_id,action)
      values(current_row.id,current_row.exhibition_id,auth.uid(),'check_in');
  end if;
  return jsonb_build_object('id',current_row.id,'checked_in_at',current_row.checked_in_at,'already_checked_in',already);
end $$;
create function public.protocol_check_in(p_invitation_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select abaad_private.protocol_check_in(p_invitation_id); $$;

create function abaad_private.protocol_undo_check_in(p_invitation_id uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare current_row public.protocol_invitations;
begin
  if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise invalid_parameter_value; end if;
  select * into current_row from public.protocol_invitations where id=p_invitation_id for update;
  if not found or not coalesce(abaad_private.protocol_allowed(current_row.exhibition_id),false) then raise insufficient_privilege; end if;
  if current_row.checked_in_at is null then return jsonb_build_object('already_pending',true); end if;
  insert into public.protocol_attendance_events(invitation_id,exhibition_id,actor_id,action,reason,previous_checked_in_at)
    values(current_row.id,current_row.exhibition_id,auth.uid(),'undo_check_in',trim(p_reason),current_row.checked_in_at);
  update public.protocol_invitations set checked_in_at=null,checked_in_by=null,updated_at=clock_timestamp() where id=p_invitation_id;
  return jsonb_build_object('already_pending',false);
end $$;
create function public.protocol_undo_check_in(p_invitation_id uuid,p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select abaad_private.protocol_undo_check_in(p_invitation_id,p_reason); $$;

-- Add/edit only by active admin. An existing guest_id permits explicit reuse across exhibitions.
create function abaad_private.protocol_save_guest(p_slug text,p_data jsonb,p_invitation_id uuid default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare target uuid; person uuid; invitation uuid; category uuid; fingerprint text; old_person uuid; source_namespace text; source_record text;
begin
  if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  select id into target from public.protocol_exhibitions where slug=p_slug;
  if target is null or not coalesce(abaad_private.protocol_allowed(target),false) then raise insufficient_privilege; end if;
  if jsonb_typeof(p_data) <> 'object' then raise invalid_parameter_value; end if;
  category := nullif(p_data->>'category_id','')::uuid;
  if category is null and nullif(p_data->>'category','') is not null then
    select id into category from public.protocol_categories where exhibition_id=target and label=p_data->>'category';
    if category is null then raise invalid_parameter_value; end if;
  end if;
  if category is not null and not exists(select 1 from public.protocol_categories where id=category and exhibition_id=target) then raise invalid_parameter_value; end if;

  if p_invitation_id is not null then
    select guest_id,source_key,source_record_key into old_person,source_namespace,source_record from public.protocol_invitations where id=p_invitation_id and exhibition_id=target for update;
    if not found then raise insufficient_privilege; end if;
    person := old_person;
  else
    person := nullif(p_data->>'guest_id','')::uuid;
  end if;
  source_namespace:=coalesce(nullif(p_data->>'source_key',''),source_namespace);
  source_record:=coalesce(nullif(p_data->>'source_record_key',''),source_record);
  if (source_namespace is null)<>(source_record is null) then raise invalid_parameter_value; end if;
  if person is null then
    insert into public.protocol_guests(full_name_ar,full_name_en,official_title,organization,photo_public_id,photo_url,photo_gravity)
    values(trim(p_data->>'full_name_ar'),nullif(trim(p_data->>'full_name_en'),''),coalesce(trim(p_data->>'official_title'),''),coalesce(trim(p_data->>'organization'),''),nullif(p_data->>'photo_public_id',''),nullif(p_data->>'photo_url',''),coalesce(nullif(p_data->>'photo_gravity',''),'face')) returning id into person;
  elsif p_invitation_id is not null then
    -- Copy-on-edit if other exhibitions reference this identity; do not silently alter their data.
    if exists(select 1 from public.protocol_invitations where guest_id=person and id<>p_invitation_id) then
      insert into public.protocol_guests(full_name_ar,full_name_en,official_title,organization,photo_public_id,photo_url,photo_gravity)
      values(trim(p_data->>'full_name_ar'),nullif(trim(p_data->>'full_name_en'),''),coalesce(trim(p_data->>'official_title'),''),coalesce(trim(p_data->>'organization'),''),nullif(p_data->>'photo_public_id',''),nullif(p_data->>'photo_url',''),coalesce(nullif(p_data->>'photo_gravity',''),'face')) returning id into person;
    else
      update public.protocol_guests set full_name_ar=trim(p_data->>'full_name_ar'),full_name_en=nullif(trim(p_data->>'full_name_en'),''),official_title=coalesce(trim(p_data->>'official_title'),''),organization=coalesce(trim(p_data->>'organization'),''),photo_public_id=nullif(p_data->>'photo_public_id',''),photo_url=case when p_data?'photo_url' then nullif(p_data->>'photo_url','') else photo_url end,photo_gravity=coalesce(nullif(p_data->>'photo_gravity',''),photo_gravity),updated_at=clock_timestamp() where id=person;
    end if;
  elsif not exists(select 1 from public.protocol_guests where id=person) then raise invalid_parameter_value;
  end if;
  select md5(concat_ws(chr(31),abaad_private.protocol_normalize(g.full_name_ar),abaad_private.protocol_normalize(g.official_title),abaad_private.protocol_normalize(g.organization))) into fingerprint from public.protocol_guests g where g.id=person;
  if source_namespace is not null then fingerprint:=md5('source:'||source_namespace||chr(31)||source_record); end if;
  if p_invitation_id is null then
    insert into public.protocol_invitations(exhibition_id,guest_id,category_id,seating_location,internal_notes,dedup_key,display_order,priority_level,review_required,review_note,source_key,source_record_key,source_description)
      values(target,person,category,nullif(trim(p_data->>'seating_location'),''),nullif(trim(p_data->>'internal_notes'),''),fingerprint,coalesce((p_data->>'display_order')::integer,0),coalesce(nullif(p_data->>'priority_level',''),'regular'),coalesce((p_data->>'review_required')::boolean,false),nullif(p_data->>'review_note',''),source_namespace,source_record,nullif(p_data->>'source_description','')) returning id into invitation;
  else
    update public.protocol_invitations set guest_id=person,category_id=category,seating_location=nullif(trim(p_data->>'seating_location'),''),internal_notes=nullif(trim(p_data->>'internal_notes'),''),dedup_key=fingerprint,display_order=coalesce((p_data->>'display_order')::integer,display_order),priority_level=coalesce(nullif(p_data->>'priority_level',''),priority_level),review_required=coalesce((p_data->>'review_required')::boolean,review_required),review_note=case when p_data?'review_note' then nullif(p_data->>'review_note','') else review_note end,source_key=source_namespace,source_record_key=source_record,source_description=coalesce(nullif(p_data->>'source_description',''),source_description),updated_at=clock_timestamp()
      where id=p_invitation_id and exhibition_id=target returning id into invitation;
  end if;
  return invitation;
end $$;
create function public.protocol_save_guest(p_slug text,p_data jsonb,p_invitation_id uuid default null) returns uuid
language sql security invoker set search_path = '' as $$ select abaad_private.protocol_save_guest(p_slug,p_data,p_invitation_id); $$;

create function abaad_private.protocol_import_guests(p_slug text,p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare row_data jsonb; row_no integer:=1; succeeded integer:=0; duplicated integer:=0; failed integer:=0; errors jsonb:='[]';
begin
  if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise invalid_parameter_value; end if;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    begin
      perform abaad_private.protocol_save_guest(p_slug,row_data,null);
      succeeded:=succeeded+1;
    exception when unique_violation then duplicated:=duplicated+1;
      errors:=errors||jsonb_build_object('row',row_no,'message','سجل مكرر؛ لم تتم إضافته');
    when check_violation or invalid_text_representation or not_null_violation or foreign_key_violation or invalid_parameter_value then
      failed:=failed+1; errors:=errors||jsonb_build_object('row',row_no,'message','تعذر حفظ السجل؛ راجع الحقول والتصنيف');
    end;
    row_no:=row_no+1;
  end loop;
  return jsonb_build_object('succeeded',succeeded,'duplicated',duplicated,'failed',failed,'errors',errors);
end $$;
create function public.protocol_import_guests(p_slug text,p_rows jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select abaad_private.protocol_import_guests(p_slug,p_rows); $$;

create function public.protocol_photo_ref(p_invitation_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('photo_public_id',g.photo_public_id,'photo_url',g.photo_url,'photo_gravity',g.photo_gravity) from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id where i.id=p_invitation_id;
$$;
revoke all on function abaad_private.protocol_check_in(uuid) from public,anon,authenticated;
grant execute on function abaad_private.protocol_check_in(uuid) to authenticated;
revoke all on function public.protocol_check_in(uuid) from public,anon,authenticated;
grant execute on function public.protocol_check_in(uuid) to authenticated;
revoke all on function abaad_private.protocol_undo_check_in(uuid,text) from public,anon,authenticated;
grant execute on function abaad_private.protocol_undo_check_in(uuid,text) to authenticated;
revoke all on function public.protocol_undo_check_in(uuid,text) from public,anon,authenticated;
grant execute on function public.protocol_undo_check_in(uuid,text) to authenticated;
revoke all on function abaad_private.protocol_save_guest(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function abaad_private.protocol_save_guest(text,jsonb,uuid) to authenticated;
revoke all on function public.protocol_save_guest(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.protocol_save_guest(text,jsonb,uuid) to authenticated;
revoke all on function abaad_private.protocol_import_guests(text,jsonb) from public,anon,authenticated;
grant execute on function abaad_private.protocol_import_guests(text,jsonb) to authenticated;
revoke all on function public.protocol_import_guests(text,jsonb) from public,anon,authenticated;
grant execute on function public.protocol_import_guests(text,jsonb) to authenticated;
revoke all on function public.protocol_snapshot(text,text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.protocol_snapshot(text,text,uuid,text,integer,text) to authenticated;
revoke all on function public.protocol_photo_ref(uuid) from public,anon,authenticated;
grant execute on function public.protocol_photo_ref(uuid) to authenticated;

-- Only the exhibition identity supplied by the user is seeded; NO guests or staff assignments.
insert into public.protocol_exhibitions(slug,name) values('naima-baghdad-2026','نعيمة وذاكرة بغداد');
insert into public.protocol_categories(exhibition_id,label,display_order)
select e.id, c.label,c.position from public.protocol_exhibitions e
cross join (values ('شخصيات رسمية',1),('فنانون ومثقفون',2),('إعلاميون',3),('ضيوف آخرون',4),('شخصيات ثقافية',5),('شركاء المعرض',6)) c(label,position)
where e.slug='naima-baghdad-2026';

-- Administrator-only read-only import plan. Never match by a name alone.
create function abaad_private.protocol_import_plan(p_slug text,p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; item jsonb; position integer:=0; new_n integer:=0; old_n integer:=0; updates integer:=0; unchanged integer:=0; conflicts integer:=0;
  found_id uuid; found_name text; found_hash text; digest text; namespace text; record_key text; identity_key text; action text; explanation text;
  seen_keys text[]:='{}'; seen_identities text[]:='{}'; records jsonb:='[]';
begin
  if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  select id into target from public.protocol_exhibitions where slug=p_slug;
  if target is null or not coalesce(abaad_private.protocol_allowed(target),false) then raise insufficient_privilege; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise invalid_parameter_value; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    position:=position+1; found_id:=null; found_name:=null; found_hash:=null; explanation:=null; action:='new';
    namespace:=nullif(item->>'source_key','');record_key:=nullif(item->>'source_record_key','');digest:=md5(item::text);
    identity_key:=md5(concat_ws(chr(31),abaad_private.protocol_normalize(item->>'full_name_ar'),abaad_private.protocol_normalize(item->>'official_title'),abaad_private.protocol_normalize(item->>'organization')));
    if char_length(trim(coalesce(item->>'full_name_ar','')))<2
      or coalesce(item->>'priority_level','regular') not in ('vvip','vip','priority','regular')
      or (namespace is null)<>(record_key is null) then action:='conflict';explanation:='بيانات أو أولوية أو معرف مصدر غير صالح';
    elsif identity_key=any(seen_identities) or (namespace is not null and (namespace||chr(31)||record_key)=any(seen_keys)) then
      action:='conflict';explanation:='سجل أو معرف مكرر داخل الملف';
    else
      seen_identities:=array_append(seen_identities,identity_key);
      if namespace is not null then
        seen_keys:=array_append(seen_keys,namespace||chr(31)||record_key);
        select i.id,g.full_name_ar,i.source_fingerprint into found_id,found_name,found_hash
          from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
          where i.exhibition_id=target and i.source_key=namespace and i.source_record_key=record_key;
        if found_id is not null and abaad_private.protocol_normalize(found_name)<>abaad_private.protocol_normalize(item->>'full_name_ar') then
          action:='conflict';explanation:='معرف المصدر مرتبط باسم مختلف؛ يلزم قرار إداري';
        elsif found_id is not null then action:=case when found_hash=digest then 'unchanged' else 'update' end;
        else
          -- Existing records without source IDs may be adopted only on exact name/title/organization identity.
          select i.id,g.full_name_ar,i.source_fingerprint into found_id,found_name,found_hash
          from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
          where i.exhibition_id=target and i.source_key is null
          and abaad_private.protocol_normalize(g.full_name_ar)=abaad_private.protocol_normalize(item->>'full_name_ar')
          and abaad_private.protocol_normalize(g.official_title)=abaad_private.protocol_normalize(item->>'official_title')
          and abaad_private.protocol_normalize(g.organization)=abaad_private.protocol_normalize(item->>'organization');
          if found_id is not null then action:='update';
          elsif exists(select 1 from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
            where i.exhibition_id=target and i.source_key is not null
            and abaad_private.protocol_normalize(g.full_name_ar)=abaad_private.protocol_normalize(item->>'full_name_ar')
            and abaad_private.protocol_normalize(g.official_title)=abaad_private.protocol_normalize(item->>'official_title')
            and abaad_private.protocol_normalize(g.organization)=abaad_private.protocol_normalize(item->>'organization')) then
            action:='conflict';explanation:='الهوية الكاملة موجودة بمعرف مصدر مختلف؛ راجع ترقيم المصدر لتجنب التكرار';
          end if;
        end if;
      else
        select i.id into found_id from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id
        where i.exhibition_id=target and abaad_private.protocol_normalize(g.full_name_ar)=abaad_private.protocol_normalize(item->>'full_name_ar')
          and abaad_private.protocol_normalize(g.official_title)=abaad_private.protocol_normalize(item->>'official_title')
          and abaad_private.protocol_normalize(g.organization)=abaad_private.protocol_normalize(item->>'organization');
        if found_id is not null then action:='unchanged'; end if;
      end if;
    end if;
    if action='conflict' then conflicts:=conflicts+1;
    elsif action='new' then new_n:=new_n+1;
    else old_n:=old_n+1;if action='update' then updates:=updates+1;else unchanged:=unchanged+1;end if;end if;
    records:=records||jsonb_build_object('row',position,'action',action,'id',found_id,'message',explanation);
  end loop;
  return jsonb_build_object('new_count',new_n,'existing_count',old_n,'update_count',updates,'unchanged_count',unchanged,'conflict_count',conflicts,'rows',records);
end $$;
create function public.protocol_import_plan(p_slug text,p_rows jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$select abaad_private.protocol_import_plan(p_slug,p_rows);$$;

-- Recheck the plan under an exhibition-specific import lock. Any conflict aborts all writes.
-- Only metadata is updated: checked_in_at and checked_in_by are deliberately untouched.
create function abaad_private.protocol_merge_import(p_slug text,p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare target uuid; plan jsonb; entry jsonb; item jsonb; invitation uuid; old_data jsonb; merged jsonb; key text;
  inserted integer:=0; updated integer:=0; skipped integer:=0;
begin
  if (select abaad_private.protocol_actor_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  select id into target from public.protocol_exhibitions where slug=p_slug;
  if target is null or not coalesce(abaad_private.protocol_allowed(target),false) then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,0));
  plan:=abaad_private.protocol_import_plan(p_slug,p_rows);
  if (plan->>'conflict_count')::integer>0 then
    return jsonb_build_object('aborted',true,'succeeded',0,'updated',0,'duplicated',0,'failed',(plan->>'conflict_count')::integer,'errors',plan->'rows');
  end if;
  for entry in select value from jsonb_array_elements(plan->'rows') loop
    item:=p_rows->((entry->>'row')::integer-1);
    if entry->>'action'='unchanged' then skipped:=skipped+1;continue;end if;
    invitation:=nullif(entry->>'id','')::uuid;merged:=item;
    if invitation is not null then
      select to_jsonb(g)||to_jsonb(i) into old_data from public.protocol_invitations i join public.protocol_guests g on g.id=i.guest_id where i.id=invitation and i.exhibition_id=target for update of i;
      if old_data is null or abaad_private.protocol_normalize(old_data->>'full_name_ar')<>abaad_private.protocol_normalize(item->>'full_name_ar') then raise insufficient_privilege;end if;
      -- Empty optional CSV cells are missing input, not permission to erase existing operational metadata.
      foreach key in array array['full_name_en','official_title','organization','photo_public_id','photo_url','seating_location','internal_notes'] loop
        if nullif(item->>key,'') is null and nullif(old_data->>key,'') is not null then merged:=jsonb_set(merged,array[key],old_data->key);end if;
      end loop;
    end if;
    invitation:=abaad_private.protocol_save_guest(p_slug,merged,invitation);
    if nullif(item->>'source_key','') is not null then
      update public.protocol_invitations set source_fingerprint=md5(item::text) where id=invitation;
    end if;
    if entry->>'action'='new' then inserted:=inserted+1;else updated:=updated+1;end if;
  end loop;
  return jsonb_build_object('aborted',false,'succeeded',inserted,'updated',updated,'duplicated',skipped,'failed',0,'errors','[]'::jsonb);
end $$;
create function public.protocol_merge_import(p_slug text,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select abaad_private.protocol_merge_import(p_slug,p_rows);$$;
revoke all on function abaad_private.protocol_import_plan(text,jsonb) from public,anon,authenticated;
revoke all on function public.protocol_import_plan(text,jsonb) from public,anon,authenticated;
revoke all on function abaad_private.protocol_merge_import(text,jsonb) from public,anon,authenticated;
revoke all on function public.protocol_merge_import(text,jsonb) from public,anon,authenticated;
grant execute on function abaad_private.protocol_import_plan(text,jsonb) to authenticated;
grant execute on function public.protocol_import_plan(text,jsonb) to authenticated;
grant execute on function abaad_private.protocol_merge_import(text,jsonb) to authenticated;
grant execute on function public.protocol_merge_import(text,jsonb) to authenticated;

commit;
-- After approval: explicitly assign authorized protocol staff via trusted administration.
-- No ALTER of staff_roles, no Auth changes, no deletes, no Realtime publication changes.
