-- REVIEW ONLY: pwlwelxnrrignapdsyiw / gallery-org. No production execution.
-- Existing booking records/capacity/check-in functions are reused. No historic counts are backfilled.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
alter table public.exhibition_bookings drop constraint exhibition_bookings_source_check;
alter table public.exhibition_bookings add constraint exhibition_bookings_source_check check(source in ('website','walk_in'));

create table public.exhibition_booking_visitors(
 id uuid primary key default gen_random_uuid(),
 exhibition_id uuid not null references public.protocol_exhibitions(id),
 booking_id uuid not null references public.exhibition_bookings(id),
 position integer not null check(position between 1 and 200),
 full_name text not null check(char_length(trim(full_name)) between 2 and 160),
 phone text not null check(phone ~ '^\+9647[0-9]{9}$'),
 address text not null check(char_length(trim(address)) between 2 and 300),
 visit_date date not null check(visit_date between date '2026-10-31' and date '2026-11-09'),
 entry_kind text not null check(entry_kind in ('arrival','complete','walk_in')),
 actor_id uuid not null references auth.users(id),
 operation_id uuid not null unique,
 payload_hash text not null,
 identity_key text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(booking_id,position),unique(exhibition_id,visit_date,identity_key)
);
create index exhibition_booking_visitors_booking_idx on public.exhibition_booking_visitors(booking_id,created_at);
alter table public.exhibition_booking_visitors enable row level security;
alter table public.exhibition_booking_visitors force row level security;
revoke all on public.exhibition_booking_visitors from public,anon,authenticated,service_role;
-- Only narrowly scoped RPCs expose these personal records; no direct table access.

create function abaad_private.booking_visitors(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.exhibition_bookings;
begin
 select * into b from public.exhibition_bookings where id=p_id;
 if not found or not coalesce(abaad_private.protocol_allowed(b.exhibition_id),false) then raise insufficient_privilege;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'position',v.position,'full_name',v.full_name,'phone',v.phone,'address',v.address,'visit_date',v.visit_date,'entry_kind',v.entry_kind,'created_at',v.created_at) order by v.position) from public.exhibition_booking_visitors v where booking_id=p_id),'[]'::jsonb);
end$$;

create function abaad_private.booking_visitor_save(p_id uuid,p_data jsonb,p_mode text,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.exhibition_bookings;v public.exhibition_booking_visitors;pos integer;hash text;identity text;day date;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 select * into b from public.exhibition_bookings where id=p_id for update;
 if not found or not coalesce(abaad_private.protocol_allowed(b.exhibition_id),false) then raise insufficient_privilege;end if;
 if p_operation is null or p_mode not in ('arrival','complete','walk_in') or p_mode is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'visitor_invalid';end if;
 if (p_data->>'full_name') is null or (p_data->>'address') is null or char_length(trim(p_data->>'full_name')) not between 2 and 160 or char_length(trim(p_data->>'address')) not between 2 and 300 or coalesce(p_data->>'phone','') !~ '^\+9647[0-9]{9}$' or coalesce(p_data->>'visit_date','') !~ '^2026-(10|11)-[0-9]{2}$' then raise exception 'visitor_invalid';end if;
 day:=(p_data->>'visit_date')::date;
 if day not between date '2026-10-31' and date '2026-11-09' or day>(now() at time zone 'Asia/Baghdad')::date then raise exception 'visitor_date';end if;
 hash:=md5(jsonb_build_object('booking',p_id,'name',trim(p_data->>'full_name'),'phone',p_data->>'phone','address',trim(p_data->>'address'),'date',day,'mode',p_mode,'reason',coalesce(p_data->>'reason',''))::text);
 select * into v from public.exhibition_booking_visitors where operation_id=p_operation;
 if found then
  if v.booking_id<>p_id or v.actor_id<>auth.uid() or v.payload_hash<>hash then raise exception 'operation_conflict';end if;
  return jsonb_build_object('ok',true,'replayed',true,'booking_id',p_id);
 end if;
 if b.status<>'confirmed' then raise exception 'visitor_booking_cancelled';end if;
 if p_mode='walk_in' and b.source<>'walk_in' then raise exception 'visitor_invalid';end if;
 if p_mode='complete' then
  select min(n) into pos from generate_series(1,b.checked_in_guest_count)n where not exists(select 1 from public.exhibition_booking_visitors where booking_id=p_id and position=n);
 else
  if day<>(now() at time zone 'Asia/Baghdad')::date then raise exception 'visitor_date';end if;
  pos:=b.checked_in_guest_count+1;
  if pos>b.guest_count or exists(select 1 from public.exhibition_booking_visitors where booking_id=p_id and position=pos) then raise exception 'visitor_count';end if;
 end if;
 if pos is null then raise exception 'visitor_count';end if;
 identity:=md5(concat_ws(chr(31),abaad_private.protocol_normalize(p_data->>'full_name'),p_data->>'phone'));
 if exists(select 1 from public.exhibition_booking_visitors where exhibition_id=b.exhibition_id and visit_date=day and identity_key=identity) then raise exception 'visitor_duplicate';end if;
 if exists(select 1 from public.exhibition_booking_checkin_events where operation_id=p_operation) then raise exception 'operation_conflict';end if;
 insert into public.exhibition_booking_visitors(exhibition_id,booking_id,position,full_name,phone,address,visit_date,entry_kind,actor_id,operation_id,payload_hash,identity_key)
 values(b.exhibition_id,p_id,pos,trim(p_data->>'full_name'),p_data->>'phone',trim(p_data->>'address'),day,p_mode,auth.uid(),p_operation,hash,identity);
 if p_mode<>'complete' then
  result:=abaad_private.booking_arrival(p_id,1,p_operation,coalesce(p_data->>'reason',''));
  if result->>'ok' is distinct from 'true' then raise exception 'visitor_arrival_failed';end if;
 else update public.exhibition_bookings set updated_at=clock_timestamp() where id=p_id;
 end if;
 return jsonb_build_object('ok',true,'booking_id',p_id);
end$$;

create function abaad_private.booking_walk_in(p_slot uuid,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.exhibition_booking_slots;b public.exhibition_bookings;hash text;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('abaad-exhibition-bookings-2026'));
 select sl.* into s from public.exhibition_booking_slots sl join public.protocol_exhibitions e on e.id=sl.exhibition_id where sl.id=p_slot and e.slug='naima-baghdad-2026' and e.is_active for update of sl;
 if not found or not coalesce(abaad_private.protocol_allowed(s.exhibition_id),false) then raise insufficient_privilege;end if;
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'visitor_invalid';end if;
 hash:=encode(sha256(convert_to(jsonb_build_object('slot',p_slot,'data',p_data,'actor',auth.uid())::text,'UTF8')),'hex');
 select * into b from public.exhibition_bookings where request_key=p_operation;
 if found then
  if b.request_hash<>hash or b.source<>'walk_in' then raise exception 'operation_conflict';end if;
  return jsonb_build_object('ok',true,'replayed',true,'booking_id',b.id,'booking_reference',b.booking_reference);
 end if;
 if s.is_closed or s.capacity is null or s.visit_date<>(now() at time zone 'Asia/Baghdad')::date or s.visit_date<>(p_data->>'visit_date')::date or s.start_time not in (time '17:00',time '18:00',time '19:00',time '20:00') or s.end_time<>s.start_time+interval '1 hour' or (s.visit_date+s.end_time) at time zone 'Asia/Baghdad'<=now() then raise exception 'walk_in_closed';end if;
 if s.reserved_count+1>least(s.capacity,60) then raise exception 'walk_in_capacity';end if;
 if (select coalesce(sum(reserved_count),0) from public.exhibition_booking_slots where exhibition_id=s.exhibition_id and visit_date=s.visit_date)+1>200 then raise exception 'walk_in_daily_capacity';end if;
 if exists(select 1 from public.exhibition_bookings where exhibition_id=s.exhibition_id and visit_date=s.visit_date and status='confirmed' and phone=p_data->>'phone' and abaad_private.protocol_normalize(full_name)=abaad_private.protocol_normalize(p_data->>'full_name')) then raise exception 'walk_in_existing_booking';end if;
 insert into public.exhibition_bookings(exhibition_id,slot_id,visit_date,full_name,phone,notes,guest_count,source,request_key,request_hash,token_hash)
 values(s.exhibition_id,s.id,s.visit_date,trim(p_data->>'full_name'),p_data->>'phone','تسجيل من الباب',1,'walk_in',p_operation,hash,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex')) returning * into b;
 update public.exhibition_booking_slots set reserved_count=reserved_count+1,version=version+1,updated_at=clock_timestamp() where id=s.id;
 result:=abaad_private.booking_visitor_save(b.id,p_data,'walk_in',p_operation);
 return result||jsonb_build_object('booking_reference',b.booking_reference);
end$$;

-- Preserve the existing arrival function and every role/date/count check.
-- Require the named visitor record before any NEW positive arrival.
do $guard$
declare definition text;marker text:=' if b.status<>''confirmed'' or b.checked_in_guest_count+p_delta not between 0 and b.guest_count then';
begin
 definition:=pg_get_functiondef('abaad_private.booking_arrival(uuid,integer,uuid,text)'::regprocedure);
 if strpos(definition,marker)=0 then raise exception 'Arrival function changed; review before applying';end if;
 definition:=replace(definition,marker,E' if p_delta>0 and (p_delta<>1 or not exists(select 1 from public.exhibition_booking_visitors where booking_id=p_id and operation_id=p_operation and actor_id=auth.uid() and entry_kind in (''arrival'',''walk_in''))) then raise exception ''visitor_details_required'';end if;\n'||marker);
 execute definition;
end $guard$;

create function public.booking_visitors(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select abaad_private.booking_visitors(p_id);$$;
create function public.booking_visitor_save(p_id uuid,p_data jsonb,p_mode text,p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.booking_visitor_save(p_id,p_data,p_mode,p_operation);$$;
create function public.booking_walk_in(p_slot uuid,p_data jsonb,p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$select abaad_private.booking_walk_in(p_slot,p_data,p_operation);$$;
revoke all on function abaad_private.booking_visitors(uuid),abaad_private.booking_visitor_save(uuid,jsonb,text,uuid),abaad_private.booking_walk_in(uuid,jsonb,uuid),public.booking_visitors(uuid),public.booking_visitor_save(uuid,jsonb,text,uuid),public.booking_walk_in(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function abaad_private.booking_visitors(uuid),abaad_private.booking_visitor_save(uuid,jsonb,text,uuid),abaad_private.booking_walk_in(uuid,jsonb,uuid),public.booking_visitors(uuid),public.booking_visitor_save(uuid,jsonb,text,uuid),public.booking_walk_in(uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
