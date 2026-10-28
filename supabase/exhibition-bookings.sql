-- ABAAD EXHIBIT Phase 06 — REVIEW ONLY, NOT APPLIED.
-- Target: pwlwelxnrrignapdsyiw. Requires reviewed staff_roles.sql + protocol.sql.
-- No existing table, policy, Auth setting or guest row is modified. No slots are seeded.
begin;
create table public.exhibition_booking_slots (
 id uuid primary key default gen_random_uuid(),
 exhibition_id uuid not null references public.protocol_exhibitions(id),
 visit_date date not null check(visit_date between date '2026-10-31' and date '2026-11-09'),
 start_time time not null, end_time time not null check(end_time>start_time),
 capacity integer check(capacity between 1 and 100000),
 reserved_count integer not null default 0 check(reserved_count>=0),
 is_closed boolean not null default true,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(exhibition_id,visit_date,start_time), unique(exhibition_id,id),
 check(capacity is null and reserved_count=0 or capacity>=reserved_count),
 check(is_closed or capacity is not null)
);
create table public.exhibition_bookings (
 id uuid primary key default gen_random_uuid(),
 booking_reference text not null unique default ('EX-'||upper(replace(gen_random_uuid()::text,'-',''))),
 exhibition_id uuid not null references public.protocol_exhibitions(id),
 slot_id uuid not null, visit_date date not null,
 full_name text not null check(char_length(trim(full_name)) between 2 and 160),
 phone text not null check(phone ~ '^\+9647[0-9]{9}$'),
 email text check(char_length(email)<=254), notes text not null default '' check(char_length(notes)<=500),
 guest_count integer not null check(guest_count between 1 and 200),
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 checked_in_guest_count integer not null default 0 check(checked_in_guest_count>=0 and checked_in_guest_count<=guest_count),
 request_key uuid not null unique, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 price_usd integer not null default 0 check(price_usd=0), source text not null default 'website' check(source='website'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), cancelled_at timestamptz,
 foreign key(exhibition_id,slot_id) references public.exhibition_booking_slots(exhibition_id,id),
 check((status='cancelled')=(cancelled_at is not null))
);
create index exhibition_bookings_list_idx on public.exhibition_bookings(exhibition_id,visit_date,created_at desc,id);
create index exhibition_bookings_slot_idx on public.exhibition_bookings(slot_id);
create index exhibition_bookings_phone_idx on public.exhibition_bookings(exhibition_id,phone);
create table public.exhibition_booking_checkin_events (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.exhibition_bookings(id),
 actor_id uuid not null references auth.users(id), operation_id uuid not null unique,
 action text not null check(action in ('check_in','correction','cancel','reschedule','date_override')),
 guest_delta integer not null, reason text, details jsonb not null default '{}', created_at timestamptz not null default now(),
 check(action='check_in' or char_length(trim(reason)) between 5 and 500)
);
create index exhibition_booking_events_booking_idx on public.exhibition_booking_checkin_events(booking_id,created_at);
create index exhibition_booking_events_actor_idx on public.exhibition_booking_checkin_events(actor_id);
create table public.exhibition_booking_notifications (
 booking_id uuid primary key references public.exhibition_bookings(id),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','unconfigured')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_id uuid, updated_at timestamptz not null default now()
);
-- Durable per-IP hashed rate buckets; never exposed to the Data API. No raw IP is retained.
create table abaad_private.booking_rate_buckets (
 ip_hash text not null, bucket timestamptz not null, attempts integer not null default 1,
 primary key(ip_hash,bucket)
);
alter table abaad_private.booking_rate_buckets enable row level security;
revoke all on abaad_private.booking_rate_buckets from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['exhibition_booking_slots','exhibition_bookings','exhibition_booking_checkin_events','exhibition_booking_notifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
-- Personal data and delivery internals are only returned by narrowly scoped RPCs.
-- No direct table grants are needed by either application, including service_role.

create function abaad_private.booking_slots() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'visit_date',s.visit_date,'start_time',s.start_time,'end_time',s.end_time,
 'remaining',s.capacity-s.reserved_count) order by s.visit_date,s.start_time),'[]')
 from public.exhibition_booking_slots s join public.protocol_exhibitions e on e.id=s.exhibition_id
 where e.slug='naima-baghdad-2026' and e.is_active and not s.is_closed and s.capacity>s.reserved_count
 and (s.visit_date+s.end_time) at time zone 'Asia/Baghdad'>now();
$$;
create function abaad_private.booking_create(p_data jsonb,p_request_key uuid,p_request_hash text,p_token_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.exhibition_bookings; s public.exhibition_booking_slots; n integer; ip_count integer;
begin
 -- A single bounded exhibition queue serializes capacity, cancellation and rescheduling.
 -- Slot row locks additionally document the capacity invariant. No application-side count-then-insert.
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 if p_request_key is null or p_request_hash is null or p_token_hash is null or p_ip_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' or p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 select * into b from public.exhibition_bookings where request_key=p_request_key;
 if found then
  if b.request_hash<>p_request_hash or b.token_hash<>p_token_hash then raise exception 'idempotency_conflict'; end if;
 else
  insert into abaad_private.booking_rate_buckets(ip_hash,bucket) values(p_ip_hash,date_trunc('hour',now()))
   on conflict(ip_hash,bucket) do update set attempts=abaad_private.booking_rate_buckets.attempts+1 returning attempts into ip_count;
  delete from abaad_private.booking_rate_buckets where bucket<now()-interval '2 hours';
  -- Return, rather than raise: rejected attempts must not roll back the limiter.
  if ip_count>10 then return jsonb_build_object('ok',false,'code','rate_limit'); end if;
  n:=(p_data->>'guest_count')::integer;
  if n is null or n<1 or n>200 or char_length(trim(p_data->>'full_name')) not between 2 and 160
    or coalesce(p_data->>'phone','') !~ '^\+9647[0-9]{9}$'
    or char_length(coalesce(p_data->>'notes',''))>500
    or char_length(coalesce(p_data->>'email',''))>254 then raise exception 'invalid_data'; end if;
  select sl.* into s from public.exhibition_booking_slots sl join public.protocol_exhibitions e on e.id=sl.exhibition_id
    where sl.id=(p_data->>'slot_id')::uuid and e.slug='naima-baghdad-2026' and e.is_active for update of sl;
  if not found or s.is_closed or s.capacity is null or s.visit_date<> (p_data->>'visit_date')::date
    or (s.visit_date+s.end_time) at time zone 'Asia/Baghdad'<=now() then return jsonb_build_object('ok',false,'code','closed'); end if;
  if s.reserved_count+n>s.capacity then return jsonb_build_object('ok',false,'code','capacity'); end if;
  insert into public.exhibition_bookings(exhibition_id,slot_id,visit_date,full_name,phone,email,notes,guest_count,request_key,request_hash,token_hash)
   values(s.exhibition_id,s.id,s.visit_date,trim(p_data->>'full_name'),p_data->>'phone',nullif(p_data->>'email',''),coalesce(p_data->>'notes',''),n,p_request_key,p_request_hash,p_token_hash) returning * into b;
  update public.exhibition_booking_slots set reserved_count=reserved_count+n,version=version+1,updated_at=clock_timestamp() where id=s.id;
  insert into public.exhibition_booking_notifications(booking_id) values(b.id);
 end if;
 select * into s from public.exhibition_booking_slots where id=b.slot_id;
 return jsonb_build_object('ok',true,'booking',jsonb_build_object('id',b.id,'booking_reference',b.booking_reference,'full_name',b.full_name,
  'visit_date',b.visit_date,'start_time',s.start_time,'end_time',s.end_time,'guest_count',b.guest_count,'status',b.status,'price_usd',0,'created_at',b.created_at),
  'notification_status',(select status from public.exhibition_booking_notifications where booking_id=b.id));
end $$;

-- Claim/lease prevents duplicate EmailJS sends on a double click or concurrent retry.
create function abaad_private.booking_notification(p_id uuid,p_token_hash text,p_lease uuid,p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.exhibition_bookings; n public.exhibition_booking_notifications;
begin
 select * into b from public.exhibition_bookings where id=p_id and token_hash=p_token_hash;
 if not found then raise exception 'invalid_notification'; end if;
 select * into n from public.exhibition_booking_notifications where booking_id=p_id for update;
 if p_status is not null then
  if p_status not in ('sent','failed','unconfigured') then raise exception 'invalid_status'; end if;
  update public.exhibition_booking_notifications set status=p_status,updated_at=clock_timestamp() where booking_id=p_id and lease_id=p_lease and status='sending';
  return jsonb_build_object('status',(select status from public.exhibition_booking_notifications where booking_id=p_id));
 end if;
 if n.status='sent' or n.attempts>=3 or (n.status='sending' and n.updated_at>now()-interval '5 minutes')
   or (n.attempts>0 and n.updated_at>now()-interval '1 minute') then return jsonb_build_object('claimed',false,'status',n.status); end if;
 update public.exhibition_booking_notifications set status='sending',attempts=attempts+1,lease_id=p_lease,updated_at=clock_timestamp() where booking_id=p_id;
 return jsonb_build_object('claimed',true,'status','sending','email',b.email);
end $$;

create function abaad_private.booking_snapshot(p_query text default '',p_date date default null,p_status text default 'all',p_page integer default 1,p_token_hash text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e uuid; result jsonb; q text:=abaad_private.protocol_normalize(p_query);
begin
 q:=translate(q,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
 if q ~ '^009647[0-9]*$' then q:='+'||substr(q,3); elsif q ~ '^07[0-9]*$' then q:='+964'||substr(q,2); elsif q ~ '^9647[0-9]*$' then q:='+'||q; end if;
 select id into e from public.protocol_exhibitions where slug='naima-baghdad-2026';
 if not coalesce(abaad_private.protocol_allowed(e),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_status not in ('all','confirmed','cancelled') or p_page<1 or p_page>10000 or char_length(p_query)>200 then raise exception 'invalid_filter'; end if;
 with matches as (select b.*,s.start_time,s.end_time from public.exhibition_bookings b join public.exhibition_booking_slots s on s.id=b.slot_id
  where b.exhibition_id=e and (p_date is null or b.visit_date=p_date) and (p_status='all' or b.status=p_status)
  and (p_token_hash is null or b.token_hash=p_token_hash)
  and (q='' or strpos(abaad_private.protocol_normalize(b.full_name||' '||b.phone||' '||b.booking_reference),q)>0))
 select jsonb_build_object('bookings',coalesce((select jsonb_agg(to_jsonb(x)-'token_hash'-'request_hash'-'request_key') from
  (select * from matches order by created_at desc,id limit 20 offset (p_page-1)*20) x),'[]'),'total_matches',(select count(*) from matches)) into result;
 return result||jsonb_build_object('page',p_page,'page_size',20,'observed_at',clock_timestamp(),
 'stats',(select jsonb_build_object('total',count(*),'confirmed',count(*) filter(where status='confirmed'),'cancelled',count(*) filter(where status='cancelled'),
  'expected',coalesce(sum(guest_count) filter(where status='confirmed'),0),'arrived',coalesce(sum(checked_in_guest_count),0)) from public.exhibition_bookings where exhibition_id=e),
 'slots',(select coalesce(jsonb_agg(to_jsonb(sl) order by sl.visit_date,sl.start_time),'[]') from public.exhibition_booking_slots sl where sl.exhibition_id=e),
 'recent',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select b.booking_reference,b.full_name,b.visit_date,s.start_time,b.guest_count,b.status,b.updated_at from public.exhibition_bookings b join public.exhibition_booking_slots s on s.id=b.slot_id where b.exhibition_id=e order by b.updated_at desc,b.id limit 20)x));
end $$;

create function abaad_private.booking_arrival(p_id uuid,p_delta integer,p_operation uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.exhibition_bookings; ev public.exhibition_booking_checkin_events; kind text; role_name text:=abaad_private.protocol_actor_role();
begin
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 select * into b from public.exhibition_bookings where id=p_id for update;
 if not found or not coalesce(abaad_private.protocol_allowed(b.exhibition_id),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_operation is null or p_delta is null or p_delta=0 then raise exception 'invalid_arrival'; end if;
 select * into ev from public.exhibition_booking_checkin_events where operation_id=p_operation;
 if found then
  if ev.booking_id<>p_id or ev.guest_delta<>p_delta or ev.actor_id<>auth.uid() or ev.action not in ('check_in','correction','date_override') then raise exception 'operation_conflict'; end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 if b.status<>'confirmed' or b.checked_in_guest_count+p_delta not between 0 and b.guest_count then raise exception 'invalid_arrival'; end if;
 kind:='check_in';
 if p_delta<0 then kind:='correction'; end if;
 if b.visit_date<>(now() at time zone 'Asia/Baghdad')::date then kind:='date_override'; end if;
 if kind<>'check_in' and (role_name<>'admin' or char_length(trim(coalesce(p_reason,''))) not between 5 and 500) then raise exception 'admin_reason_required'; end if;
 update public.exhibition_bookings set checked_in_guest_count=checked_in_guest_count+p_delta,updated_at=clock_timestamp() where id=b.id;
 insert into public.exhibition_booking_checkin_events(booking_id,actor_id,operation_id,action,guest_delta,reason)
  values(b.id,auth.uid(),p_operation,kind,p_delta,nullif(trim(p_reason),''));
 return jsonb_build_object('ok',true);
end $$;

create function abaad_private.booking_slot_save(p_id uuid,p_data jsonb,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.exhibition_booking_slots; e uuid;
begin
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 if abaad_private.protocol_actor_role() is distinct from 'admin' then raise exception 'forbidden' using errcode='42501'; end if;
 select id into e from public.protocol_exhibitions where slug='naima-baghdad-2026' and is_active;
 if e is null then raise exception 'exhibition_unavailable'; end if;
 if p_id is null then
  insert into public.exhibition_booking_slots(exhibition_id,visit_date,start_time,end_time,capacity,is_closed)
   values(e,(p_data->>'visit_date')::date,(p_data->>'start_time')::time,(p_data->>'end_time')::time,(p_data->>'capacity')::integer,coalesce((p_data->>'is_closed')::boolean,true)) returning * into s;
 else
  select * into s from public.exhibition_booking_slots where id=p_id and exhibition_id=e for update;
  if not found or s.version is distinct from p_version then raise exception 'stale_slot'; end if;
  -- Date/time identity is immutable; create a new slot and explicitly reschedule bookings instead.
  update public.exhibition_booking_slots set capacity=(p_data->>'capacity')::integer,is_closed=(p_data->>'is_closed')::boolean,version=version+1,updated_at=clock_timestamp() where id=p_id returning * into s;
 end if;
 return jsonb_build_object('ok',true,'id',s.id);
end $$;

create function abaad_private.booking_manage(p_id uuid,p_action text,p_slot uuid,p_reason text,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.exhibition_bookings; target public.exhibition_booking_slots; ev public.exhibition_booking_checkin_events;
begin
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 if abaad_private.protocol_actor_role() is distinct from 'admin' then raise exception 'forbidden' using errcode='42501'; end if;
 select * into b from public.exhibition_bookings where id=p_id for update;
 if not found or not coalesce(abaad_private.protocol_allowed(b.exhibition_id),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_operation is null or p_action is null or char_length(trim(coalesce(p_reason,''))) not between 5 and 500 or p_action not in ('cancel','reschedule') then raise exception 'invalid_action'; end if;
 select * into ev from public.exhibition_booking_checkin_events where operation_id=p_operation;
 if found then
  if ev.booking_id<>p_id or ev.action<>p_action or ev.actor_id<>auth.uid() or (p_action='reschedule' and ev.details->>'slot_id' is distinct from p_slot::text) then raise exception 'operation_conflict'; end if;
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 if b.status<>'confirmed' or b.checked_in_guest_count<>0 then raise exception 'booking_has_arrivals_or_cancelled'; end if;
 if p_action='reschedule' then
  select * into target from public.exhibition_booking_slots where id=p_slot and exhibition_id=b.exhibition_id for update;
  if not found or target.id=b.slot_id or target.is_closed or target.capacity is null or target.reserved_count+b.guest_count>target.capacity
   or (target.visit_date+target.end_time) at time zone 'Asia/Baghdad'<=now() then raise exception 'target_unavailable'; end if;
  update public.exhibition_booking_slots set reserved_count=reserved_count+b.guest_count,version=version+1,updated_at=clock_timestamp() where id=target.id;
 end if;
 update public.exhibition_booking_slots set reserved_count=reserved_count-b.guest_count,version=version+1,updated_at=clock_timestamp() where id=b.slot_id;
 update public.exhibition_bookings set status=case when p_action='cancel' then 'cancelled' else status end,cancelled_at=case when p_action='cancel' then clock_timestamp() else null end,
  slot_id=case when p_action='reschedule' then target.id else slot_id end,visit_date=case when p_action='reschedule' then target.visit_date else visit_date end,updated_at=clock_timestamp() where id=b.id;
 insert into public.exhibition_booking_checkin_events(booking_id,actor_id,operation_id,action,guest_delta,reason,details)
  values(b.id,auth.uid(),p_operation,p_action,0,p_reason,jsonb_build_object('previous_slot_id',b.slot_id,'slot_id',p_slot));
 return jsonb_build_object('ok',true);
end $$;
create function abaad_private.booking_events(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.exhibition_bookings b where b.id=p_id and abaad_private.protocol_allowed(b.exhibition_id)) then raise exception 'forbidden' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select e.*,s.full_name as actor_name from public.exhibition_booking_checkin_events e left join public.staff_roles s on s.user_id=e.actor_id where e.booking_id=p_id)x);
end $$;

-- Explicit grants: only trusted Booking server can create/list public availability/send notifications.
-- Authenticated staff wrappers still check live sessions and exhibition membership inside private functions.

revoke all on function abaad_private.booking_slots() from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_slots() to service_role;
create function public.booking_slots() returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_slots(); $$;
revoke all on function public.booking_slots() from public,anon,authenticated,service_role;
grant execute on function public.booking_slots() to service_role;

revoke all on function abaad_private.booking_create(jsonb,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_create(jsonb,uuid,text,text,text) to service_role;
create function public.booking_create(p_data jsonb,p_request_key uuid,p_request_hash text,p_token_hash text,p_ip_hash text) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_create(p_data,p_request_key,p_request_hash,p_token_hash,p_ip_hash); $$;
revoke all on function public.booking_create(jsonb,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.booking_create(jsonb,uuid,text,text,text) to service_role;

revoke all on function abaad_private.booking_notification(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_notification(uuid,text,uuid,text) to service_role;
create function public.booking_notification(p_id uuid,p_token_hash text,p_lease uuid,p_status text default null) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_notification(p_id,p_token_hash,p_lease,p_status); $$;
revoke all on function public.booking_notification(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.booking_notification(uuid,text,uuid,text) to service_role;

revoke all on function abaad_private.booking_snapshot(text,date,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_snapshot(text,date,text,integer,text) to authenticated;
create function public.booking_snapshot(p_query text default '',p_date date default null,p_status text default 'all',p_page integer default 1,p_token_hash text default null) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_snapshot(p_query,p_date,p_status,p_page,p_token_hash); $$;
revoke all on function public.booking_snapshot(text,date,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.booking_snapshot(text,date,text,integer,text) to authenticated;

revoke all on function abaad_private.booking_arrival(uuid,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_arrival(uuid,integer,uuid,text) to authenticated;
create function public.booking_arrival(p_id uuid,p_delta integer,p_operation uuid,p_reason text default '') returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_arrival(p_id,p_delta,p_operation,p_reason); $$;
revoke all on function public.booking_arrival(uuid,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.booking_arrival(uuid,integer,uuid,text) to authenticated;

revoke all on function abaad_private.booking_slot_save(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_slot_save(uuid,jsonb,integer) to authenticated;
create function public.booking_slot_save(p_id uuid,p_data jsonb,p_version integer) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_slot_save(p_id,p_data,p_version); $$;
revoke all on function public.booking_slot_save(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.booking_slot_save(uuid,jsonb,integer) to authenticated;

revoke all on function abaad_private.booking_manage(uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_manage(uuid,text,uuid,text,uuid) to authenticated;
create function public.booking_manage(p_id uuid,p_action text,p_slot uuid,p_reason text,p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_manage(p_id,p_action,p_slot,p_reason,p_operation); $$;
revoke all on function public.booking_manage(uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.booking_manage(uuid,text,uuid,text,uuid) to authenticated;

revoke all on function abaad_private.booking_events(uuid) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_events(uuid) to authenticated;
create function public.booking_events(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select abaad_private.booking_events(p_id); $$;
revoke all on function public.booking_events(uuid) from public,anon,authenticated,service_role;
grant execute on function public.booking_events(uuid) to authenticated;

grant usage on schema abaad_private to service_role;
commit;
